import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRelease } from '../src/release';
import { createModuleRuntime } from '../src/modules';
import { buildPageUrl, parsePageUrl, createNavigationGuard, assertPageContext } from '../src/navigation';
import { createSessionClient } from '../src/session';
import { createBrowserBridge } from '../src/bridge';

const page = { key: 'overview', label: '进度总览', scope: 'project' as const };
const rawRelease = () => ({
  schemaVersion: 1, appKey: 'aurora', releaseId: 'r1', applicationVersion: '1.0.0', runtimeApiVersion: '1',
  modules: [{ moduleKey: 'schedule', target: 'mobile', version: '1.0.0', entry: '/artifacts/schedule/1.0.0/entry.js', runtimeApiVersion: '1', pages: [page] }],
  navigation: [{ key: 'schedule', label: '进度', page: { moduleKey: 'schedule', pageKey: 'overview' } }],
});
const release = () => validateRelease(rawRelease(), { baseUrl: 'http://aurora.localhost:5200/' });
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };
const response = (data: unknown, status = 200) => new Response(JSON.stringify({ code: status, data }), { status, headers: { 'Content-Type': 'application/json' } });
const session = (uuid = 'alice', company = 'company-a', project: string | null = null) => ({ token: `token-${uuid}-${company}-${project}`, user: { uuid, lastCompanyUuid: company, lastProjectUuid: project } });
function memoryStorage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
}
test('release pins immutable copies; cross-origin scripts, duplicate keys, incompatible artifacts are rejected', () => {
  const source = rawRelease(); const checked = validateRelease(source, { baseUrl: 'http://aurora.localhost:5200/' });
  source.modules[0].entry = 'https://evil.example/entry.js';
  assert.equal(checked.modules[0].entry, 'http://aurora.localhost:5200/artifacts/schedule/1.0.0/entry.js');
  assert.ok(Object.isFrozen(checked.modules[0].pages));
  assert.throws(() => validateRelease(source, { baseUrl: 'https://app.example/' }), { code: 'UNTRUSTED_ENTRY' });
  const duplicate = rawRelease(); duplicate.modules.push(duplicate.modules[0]);
  assert.throws(() => validateRelease(duplicate, { baseUrl: 'https://app.example/' }), { code: 'DUPLICATE_MODULE' });
  const incompatible = rawRelease(); incompatible.modules[0].target = 'desktop';
  assert.throws(() => validateRelease(incompatible, { baseUrl: 'https://app.example/' }), { code: 'INCOMPATIBLE_RUNTIME' });
  assert.throws(() => createModuleRuntime(rawRelease() as any), { code: 'UNVALIDATED_RELEASE' });
});
test('host-owned navigation is explicit and cannot collide with remote module identities', () => {
  const raw = rawRelease(); raw.navigation.push({ key: 'home', label: '工作台', page: { moduleKey: 'home', pageKey: 'overview' } });
  assert.throws(() => validateRelease(raw, { baseUrl: 'https://app.example/' }), { code: 'MISSING_PAGE' });
  const checked = validateRelease(raw, { baseUrl: 'https://app.example/', localPages: [{ moduleKey: 'home', key: 'overview', label: '工作台', scope: 'both' }] });
  assert.equal(checked.navigation.length, 2);
  assert.throws(() => validateRelease(raw, { baseUrl: 'https://app.example/', localPages: [{ moduleKey: 'schedule', ...page }] }), { code: 'DUPLICATE_MODULE' });
});
test('runtime lazily imports only pinned entries; deduplicates inflight loads and supports explicit retry', async () => {
  let calls = 0;
  const runtime = createModuleRuntime(release(), { importModule: async url => {
    calls++; assert.match(url, /\/1.0.0\/entry.js$/);
    if (calls === 1) throw new Error('network');
    return { default: { frontendModule: { moduleKey: 'schedule', pages: [{ ...page, component: () => null }] } } };
  } });
  assert.equal(calls, 0);
  await assert.rejects(runtime.loadPage('schedule', 'missing'), { code: 'MISSING_PAGE' });
  assert.equal(calls, 0);
  await assert.rejects(runtime.loadPage('schedule', 'overview'), /network/);
  await assert.rejects(runtime.loadPage('schedule', 'overview'), /network/);
  assert.equal(calls, 1);
  const [a, b] = await Promise.all([runtime.loadPage('schedule', 'overview', { retry: true }), runtime.loadPage('schedule', 'overview', { retry: true })]);
  assert.equal(a, b); assert.equal(calls, 2);
  runtime.registerLocalModule({ moduleKey: 'home', pages: [{ key: 'overview', label: '工作台', scope: 'both', component: () => null }] });
  assert.equal(runtime.listPages().length, 2);
  assert.throws(() => runtime.registerLocalModule({ moduleKey: 'schedule', pages: [] }), { code: 'DUPLICATE_MODULE' });
  runtime.dispose();
  await assert.rejects(runtime.loadPage('schedule', 'overview'), { code: 'DISPOSED' });
});
test('module export identity/page metadata mismatch fails before rendering', async () => {
  for (const frontendModule of [
    { moduleKey: 'other', pages: [{ ...page, component: () => null }] },
    { moduleKey: 'schedule', pages: [{ ...page, scope: 'company', component: () => null }] },
  ]) {
    const runtime = createModuleRuntime(release(), { importModule: async () => ({ frontendModule }) });
    await assert.rejects(runtime.loadPage('schedule', 'overview'));
  }
});
test('navigation roundtrips parameters without credentials; dirty guard defaults to preserving edits', async () => {
  const target = { moduleKey: 'schedule', pageKey: 'overview', query: { recordUuid: '任务 & 1' } };
  assert.deepEqual(JSON.parse(JSON.stringify(parsePageUrl(buildPageUrl(target)))), target);
  assert.throws(() => buildPageUrl({ ...target, query: { access_token: 'secret' } }), { code: 'INVALID_QUERY' });
  assert.throws(() => parsePageUrl('/modules/schedule/overview?id=a&id=b'), { code: 'INVALID_QUERY' });
  const guard = createNavigationGuard(); const unregister = guard.register(() => true);
  assert.equal(await guard.canLeave(), false); assert.equal(await guard.canLeave(() => true), true);
  unregister(); assert.equal(await guard.canLeave(), true);
  assert.throws(() => assertPageContext('project', { status: 'authenticated', user: { uuid: 'a' }, companyUuid: 'c', epoch: 1 }), { code: 'PROJECT_REQUIRED' });
});
test('real API login/profile/workspace calls retain contract and scoped persistence', async () => {
  const storage = memoryStorage(); const calls: Array<{ path: string; body: any; headers: Headers }> = [];
  const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(url)).pathname; const body = JSON.parse(String(init?.body ?? '{}'));
    calls.push({ path, body, headers: new Headers(init?.headers) });
    if (path.endsWith('/auth/login')) return response(session());
    if (path.endsWith('/user/profile')) return response({ uuid: 'alice', username: 'Alice' });
    if (path.endsWith('/company/switch')) return response(session('alice', body.companyUuid));
    if (path.endsWith('/project/switch')) return response(session('alice', 'company-b', body.uuid));
    return response({ ok: true });
  };
  const client = createSessionClient({ baseUrl: 'https://api.example/api', appKey: 'aurora', productHost: 'app.example', storage, fetch: fetcher as typeof fetch });
  await client.login({ phone: '123', password: 'test' });
  assert.equal(calls[0].body.host, 'app.example');
  await client.setWorkspace({ companyUuid: 'company-b', projectUuid: 'project-b' });
  assert.equal(client.getSnapshot().projectUuid, 'project-b');
  await client.request('/data/schedule/task/list', { body: {} });
  assert.equal(calls.at(-1)!.headers.get('X-Project-Uuid'), 'project-b');
  const restored = createSessionClient({ baseUrl: 'https://api.example/api', appKey: 'aurora', storage, fetch: fetcher as typeof fetch });
  await restored.restore(); assert.equal(restored.getSnapshot().user?.username, 'Alice');
  assert.equal(restored.getSnapshot().companyUuid, 'company-b');
  const other = createSessionClient({ baseUrl: 'https://api.example/api', appKey: 'other', storage, fetch: fetcher as typeof fetch });
  assert.equal((await other.restore()).status, 'anonymous');
  await assert.rejects(client.request('https://evil.example'), { code: 'INVALID_API_PATH' });
  await assert.rejects(client.request('/../outside'), { code: 'INVALID_API_PATH' });
});
test('late login or data responses cannot restore a logged-out or replaced session, even if fetch ignores abort', async () => {
  const wait = deferred<Response>();
  const client = createSessionClient({ baseUrl: 'https://api.example/', fetch: (() => wait.promise) as typeof fetch });
  const login = client.login({ phone: 'a', password: 'b' }); client.logout();
  wait.resolve(response(session()));
  await assert.rejects(login, { code: 'ABORTED' });
  assert.equal(client.getSnapshot().status, 'anonymous');
  const late = deferred<Response>(); let count = 0;
  const second = createSessionClient({ baseUrl: 'https://api.example/', fetch: (async () => ++count === 2 ? late.promise : response(session(count === 1 ? 'alice' : 'bob'))) as typeof fetch });
  await second.login({ phone: 'a', password: 'b' });
  const request = second.request('/data/schedule/task/list');
  await second.login({ phone: 'b', password: 'b' });
  late.resolve(response(null, 401));
  await assert.rejects(request, { code: 'ABORTED' });
  assert.equal(second.getSnapshot().user?.uuid, 'bob');
});
test('current 401 invalidates session; caller cancellation is explicit; browser scanner does not fake success', async () => {
  let count = 0;
  const client = createSessionClient({ baseUrl: 'https://api.example/', fetch: (async () => ++count === 1 ? response(session()) : response(null, 401)) as typeof fetch });
  await client.login({ phone: 'a', password: 'b' });
  await assert.rejects(client.request('/data/schedule/task/list'), { code: 'HTTP_401' });
  assert.equal(client.getSnapshot().status, 'anonymous');
  const signal = AbortSignal.abort();
  await assert.rejects(client.request('/data/schedule/task/list', { signal }), { code: 'ABORTED' });
  await assert.rejects(createBrowserBridge().scan(), { code: 'UNSUPPORTED' });
});
test('requests started during a workspace transition cannot return old-company data after the new session commits', async () => {
  const switching = deferred<Response>(); const oldData = deferred<Response>();
  const client = createSessionClient({ baseUrl: 'https://api.example/', fetch: (async (url: string | URL | Request) => {
    const path = new URL(String(url)).pathname;
    if (path === '/auth/login') return response(session());
    if (path === '/company/switch') return switching.promise;
    return oldData.promise;
  }) as typeof fetch });
  await client.login({ phone: 'a', password: 'b' });
  const workspace = client.setWorkspace({ companyUuid: 'company-b' });
  const request = client.request('/data/schedule/task/list');
  switching.resolve(response(session('alice', 'company-b')));
  await workspace;
  oldData.resolve(response({ privateCompany: 'company-a' }));
  await assert.rejects(request, { code: 'ABORTED' });
  assert.equal(client.getSnapshot().companyUuid, 'company-b');
});
test('failed restoration invalidates data requests started while cached identity was being checked', async () => {
  const storage = memoryStorage();
  const login = createSessionClient({ baseUrl: 'https://api.example/', storage, fetch: (async () => response(session())) as typeof fetch });
  await login.login({ phone: 'a', password: 'b' });
  const profile = deferred<Response>(); const oldData = deferred<Response>();
  const restoring = createSessionClient({ baseUrl: 'https://api.example/', storage, fetch: ((url: string | URL | Request) =>
    new URL(String(url)).pathname === '/user/profile' ? profile.promise : oldData.promise) as typeof fetch });
  const restore = restoring.restore(); const request = restoring.request('/data/schedule/task/list');
  profile.resolve(response({ uuid: 'different-user' }));
  await assert.rejects(restore, { code: 'INVALID_SESSION' });
  oldData.resolve(response({ privateData: true }));
  await assert.rejects(request, { code: 'ABORTED' });
  assert.equal(restoring.getSnapshot().status, 'anonymous');
});
