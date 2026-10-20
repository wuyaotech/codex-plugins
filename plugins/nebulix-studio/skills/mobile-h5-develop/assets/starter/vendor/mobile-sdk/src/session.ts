import { abortError, MobileSdkError } from './errors';
import type { ApiRequestOptions, MobileUser, SessionClient, SessionSnapshot } from './types';

interface StoredSession { token: string; user: MobileUser }
export interface SessionClientOptions {
  baseUrl: string;
  appKey?: string;
  productHost?: string;
  fetch?: typeof globalThis.fetch;
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  storageKey?: string;
  endpoints?: { login?: string; profile?: string; companySwitch?: string; projectSwitch?: string };
}
function validSession(value: unknown): value is StoredSession {
  const candidate = value as StoredSession | null;
  return !!candidate && typeof candidate.token === 'string' && !!candidate.token.trim() &&
    !!candidate.user && typeof candidate.user.uuid === 'string' && !!candidate.user.uuid;
}
/** One client owns one app/API session. Browser/native persistence is an injected adapter. */
export function createSessionClient(options: SessionClientOptions): SessionClient {
  const base = new URL(options.baseUrl.replace(/\/?$/, '/'), typeof location === 'undefined' ? 'http://localhost' : location.href);
  const fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  const storageKey = options.storageKey ?? `nebulix.mobile.${options.appKey ?? 'app'}.${base.origin}${base.pathname}`;
  const endpoints = { login: '/auth/login', profile: '/user/profile', companySwitch: '/company/switch', projectSwitch: '/project/switch', ...options.endpoints };
  const listeners = new Set<() => void>();
  const controllers = new Set<AbortController>();
  let current: StoredSession | null = null;
  let snapshot: SessionSnapshot = Object.freeze({ status: 'anonymous', user: null, epoch: 0 });
  let disposed = false;
  function emit(status: SessionSnapshot['status'] = current ? 'authenticated' : 'anonymous') {
    const user = current ? Object.freeze({ ...current.user }) : null;
    snapshot = Object.freeze({
      status, user, epoch: snapshot.epoch,
      companyUuid: typeof user?.lastCompanyUuid === 'string' ? user.lastCompanyUuid || undefined : undefined,
      projectUuid: typeof user?.lastProjectUuid === 'string' ? user.lastProjectUuid || undefined : undefined,
    });
    for (const listener of listeners) listener();
  }
  function advance() {
    if (disposed) throw new MobileSdkError('DISPOSED', '会话客户端已销毁');
    for (const controller of controllers) controller.abort();
    controllers.clear();
    snapshot = Object.freeze({ ...snapshot, epoch: snapshot.epoch + 1 });
    return snapshot.epoch;
  }
  function persist() {
    try {
      if (current) options.storage?.setItem(storageKey, JSON.stringify(current));
      else options.storage?.removeItem(storageKey);
    } catch { /* Persistence may be unavailable; the current in-memory session stays usable. */ }
  }
  function install(value: unknown, expectedEpoch: number) {
    if (disposed || expectedEpoch !== snapshot.epoch) throw abortError();
    if (!validSession(value)) throw new MobileSdkError('INVALID_SESSION', '服务器未返回有效会话');
    // Requests can start with the previous context while a switch is awaiting
    // its server response. Invalidate those too, before publishing the new user.
    advance();
    current = { token: value.token, user: { ...value.user } };
    persist(); emit();
  }
  function logout() {
    advance(); current = null; persist(); emit();
  }
  async function send<T>(path: string, request: ApiRequestOptions = {}, anonymous = false): Promise<T> {
    if (disposed) throw new MobileSdkError('DISPOSED', '会话客户端已销毁');
    if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\') || /[\r\n]/.test(path)) throw new MobileSdkError('INVALID_API_PATH', '请求必须使用相对 API 路径');
    const url = new URL(path.slice(1), base);
    if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) throw new MobileSdkError('INVALID_API_PATH', '请求不能离开已配置 API');
    const expectedEpoch = snapshot.epoch;
    const token = anonymous ? undefined : current?.token;
    const controller = new AbortController();
    controllers.add(controller);
    const abort = () => controller.abort();
    if (request.signal?.aborted) controller.abort();
    request.signal?.addEventListener('abort', abort, { once: true });
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (options.productHost) headers['X-Product-Host'] = options.productHost;
    if (snapshot.projectUuid) headers['X-Project-Uuid'] = snapshot.projectUuid;
    const method = request.method ?? 'POST';
    const body = request.body;
    const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
    if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
    try {
      if (controller.signal.aborted) throw abortError();
      const response = await fetcher(url.href, {
        method, headers, credentials: 'omit', signal: controller.signal,
        ...(body !== undefined && method !== 'GET' ? { body: isForm ? body : JSON.stringify(body) } : {}),
      });
      if (disposed || controller.signal.aborted || expectedEpoch !== snapshot.epoch) throw abortError();
      let payload: any;
      try { payload = await response.json(); } catch {
        if (!response.ok) payload = null;
        else throw new MobileSdkError('INVALID_RESPONSE', '服务器未返回 JSON');
      }
      if (disposed || controller.signal.aborted || expectedEpoch !== snapshot.epoch) throw abortError();
      if (response.status === 401 && !anonymous && token && token === current?.token) logout();
      if (!response.ok || (payload && typeof payload.code === 'number' && payload.code !== 200)) {
        throw new MobileSdkError(payload?.businessCode ?? `HTTP_${response.status}`, payload?.message || `请求失败（${response.status}）`, { status: response.status });
      }
      return payload && typeof payload === 'object' && 'code' in payload && 'data' in payload ? payload.data as T : payload as T;
    } catch (error) {
      if (controller.signal.aborted || disposed || expectedEpoch !== snapshot.epoch) {
        // The current request's own 401 may have invalidated the session.
        if (error instanceof MobileSdkError && error.details && (error.details as { status?: number }).status === 401) throw error;
        throw abortError();
      }
      throw error;
    } finally {
      controllers.delete(controller);
      request.signal?.removeEventListener('abort', abort);
    }
  }
  const client: SessionClient = {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    async login(credentials) {
      const epoch = advance(); current = null; persist(); emit();
      const result = await send<StoredSession>(endpoints.login, { body: { ...credentials, ...(options.productHost ? { host: options.productHost } : {}) } }, true);
      install(result, epoch);
      return snapshot;
    },
    async restore() {
      const epoch = advance();
      let saved: unknown;
      try { saved = JSON.parse(options.storage?.getItem(storageKey) ?? 'null'); } catch { saved = null; }
      if (!validSession(saved)) { current = null; persist(); emit(); return snapshot; }
      current = { token: saved.token, user: { ...saved.user } };
      emit('restoring');
      try {
        const profile = await send<MobileUser>(endpoints.profile, { body: {} });
        if (!profile || profile.uuid !== saved.user.uuid) throw new MobileSdkError('INVALID_SESSION', '会话身份与服务器不一致');
        install({ token: saved.token, user: { ...saved.user, ...profile } }, epoch);
        return snapshot;
      } catch (error) {
        if (epoch === snapshot.epoch) logout();
        throw error;
      }
    },
    logout,
    async setWorkspace(workspace) {
      if (!current) throw new MobileSdkError('LOGIN_REQUIRED', '请先登录');
      if (!workspace.companyUuid?.trim()) throw new MobileSdkError('COMPANY_REQUIRED', '企业不能为空');
      let epoch = advance(); emit();
      if (snapshot.companyUuid !== workspace.companyUuid || (!workspace.projectUuid && snapshot.projectUuid)) {
        const result = await send<StoredSession>(endpoints.companySwitch, { body: { companyUuid: workspace.companyUuid } });
        if (result?.user?.lastCompanyUuid !== workspace.companyUuid) throw new MobileSdkError('INVALID_SESSION', '服务器返回了不同企业');
        install(result, epoch);
      }
      if (workspace.projectUuid) {
        // Invalidate requests started while the company transition was being rendered.
        epoch = advance(); emit();
        const result = await send<StoredSession>(endpoints.projectSwitch, { body: { uuid: workspace.projectUuid } });
        if (result?.user?.lastCompanyUuid !== workspace.companyUuid || result?.user?.lastProjectUuid !== workspace.projectUuid) throw new MobileSdkError('INVALID_SESSION', '服务器返回了不同项目');
        install(result, epoch);
      }
      return snapshot;
    },
    request: send,
    dispose() { if (!disposed) { advance(); disposed = true; current = null; listeners.clear(); } },
  };
  return client;
}
