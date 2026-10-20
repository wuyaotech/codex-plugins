import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  MobileRuntimeProvider, assertPageContext, buildPageUrl, createBrowserBridge, createModuleRuntime,
  createNavigationGuard, createSessionClient, parsePageUrl, useMobileSession, validateRelease,
  type AppRelease, type FrontendModule, type MobilePageContext, type MobilePageDef,
  type MobilePageProps, type ModuleRuntime, type PageTarget, type SessionClient, type SessionSnapshot,
} from '@nebulix/mobile-sdk';
import { h5Config } from '../h5.config';
import './mobile.css';

const homeTarget: PageTarget = { moduleKey: 'home', pageKey: 'overview' };
const profileTarget: PageTarget = { moduleKey: 'home', pageKey: 'profile' };
const demoProjects = [{ uuid: 'demo-project-riverside', name: '滨江科创中心 · 示例项目' }, { uuid: 'demo-project-garden', name: '城市公园配套 · 示例项目' }];
function configurationError(reason: unknown, fallback: string) {
  return reason instanceof Error
    ? reason.message.replaceAll('发布描述', 'H5 源码配置').replaceAll('未登记模块', '源码配置中缺少模块').replaceAll('未登记页面', '源码配置中缺少页面')
    : fallback;
}

function Icon({ name, ...props }: { name: string } & React.SVGProps<SVGSVGElement>) {
  const paths: Record<string, React.ReactNode> = {
    brand: <><path d="m4 18 5-12 4 8 3-6 4 10H4Z" /><path d="m6 18 5-4 5 4" /></>,
    home: <><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V10Z" /><path d="M9 21v-8h6v8" /></>,
    schedule: <><rect x="4" y="5" width="16" height="16" rx="3" /><path d="M8 3v5m8-5v5M4 11h16m-12 4h3m-3 3h7" /></>,
    log: <><path d="M14 4H6a2 2 0 0 0-2 2v14h14v-8M9 15l1-4 8-8 3 3-8 8-4 1Z" /><path d="m16 5 3 3" /></>,
    profile: <><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></>,
    arrow: <><path d="M4 12h16m-6-6 6 6-6 6" /></>,
    down: <path d="m6 9 6 6 6-6" />,
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
    project: <><path d="M3 21h18M5 21V8l7-4 7 4v13M9 10v2m6-2v2m-6 3v2m6-2v2M12 4V1" /></>,
    leaf: <><path d="M20 4C5 2 2 12 7 17s15 2 13-13ZM6 20l10-11" /></>,
    link: <><path d="m10 14 4-4m-6 2-2 2a4 4 0 0 0 6 6l3-3m-3-9 2-2a4 4 0 0 1 6 6l-3 3" /></>,
    logout: <><path d="M9 4H4v16h5m5-12 4 4-4 4m-6-4h12" /></>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name] ?? paths.grid}</svg>;
}

/** Preview is explicitly separate from real auth. It cannot call a backend API. */
function createPreviewSession(appKey: string): SessionClient {
  const listeners = new Set<() => void>();
  const companyUuid = `demo-company-${appKey}`;
  const storageKey = `mobile-preview-workspace:${appKey}`;
  let projectUuid: string | undefined = demoProjects[0].uuid;
  try {
    const stored = JSON.parse(sessionStorage.getItem(storageKey) || 'null') as { companyUuid?: unknown; projectUuid?: unknown } | null;
    if (stored?.companyUuid === companyUuid &&
      (stored.projectUuid === null || demoProjects.some((item) => item.uuid === stored.projectUuid))) {
      projectUuid = stored.projectUuid === null ? undefined : stored.projectUuid as string;
    }
  } catch { /* Unavailable or invalid session storage falls back to the first example project. */ }
  let snapshot: SessionSnapshot = {
    status: 'authenticated',
    user: { uuid: 'local-preview-user', displayName: '本地体验者', lastCompanyUuid: companyUuid, lastProjectUuid: projectUuid },
    companyUuid, projectUuid, epoch: 0,
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    async login() { throw new Error('本地示例模式不提供账号登录，请使用开发环境登录入口。'); },
    async restore() { return snapshot; },
    logout() {},
    async setWorkspace(workspace) {
      if (workspace.companyUuid !== companyUuid ||
        (workspace.projectUuid !== undefined && !demoProjects.some((item) => item.uuid === workspace.projectUuid))) {
        throw new Error('请选择当前应用的示例企业和项目。');
      }
      snapshot = { ...snapshot, companyUuid, projectUuid: workspace.projectUuid, epoch: snapshot.epoch + 1, user: { ...snapshot.user!, lastCompanyUuid: companyUuid, lastProjectUuid: workspace.projectUuid } };
      try {
        sessionStorage.setItem(storageKey, JSON.stringify({ companyUuid, projectUuid: workspace.projectUuid ?? null }));
      } catch { /* Keep the in-memory workspace usable when persistence is unavailable. */ }
      listeners.forEach((listener) => listener()); return snapshot;
    },
    async request() { throw new Error('本地示例模式不连接业务 API，请先登录开发环境。'); },
    dispose() { listeners.clear(); },
  };
}

interface HostContextValue {
  release: AppRelease;
  preview: boolean;
  appName: string;
  workspaceName: string;
  openWorkspace(): void;
  logout(): void;
  notify(message: string): void;
  reloadApp(): void;
}
const HostContext = createContext<HostContextValue | null>(null);
function useHost() { const value = useContext(HostContext); if (!value) throw new Error('Missing mobile host'); return value; }

function HomePage({ ctx }: MobilePageProps) {
  const { release, appName } = useHost();
  const entries = release.navigation.filter((item) => item.page.moduleKey !== 'home');
  const schedule = entries.find((item) => item.page.moduleKey === 'schedule');
  const logs = entries.find((item) => item.page.moduleKey === 'customer-site-log');
  return <section>
    <p className="mobile-home-eyebrow">A GOOD DAY TO BUILD</p>
    <h1 className="mobile-home-greeting">你好，{String(ctx.user?.displayName || ctx.user?.username || '伙伴')}</h1>
    <p className="mobile-home-lead">从现场到计划，让协作更近一步。</p>
    <div className="mobile-project-hero">
      <span className="mobile-hero-tag">施工现场 · 演示内容</span>
      <h2>把每一份专注<br />筑进每一寸空间</h2>
      <p>{appName} · 移动工作台</p>
      {schedule && <button className="mobile-hero-link" onClick={() => ctx.navigate(schedule.page)}>查看施工进度 <Icon name="arrow" /></button>}
      <svg className="mobile-hero-building" viewBox="0 0 200 180" fill="none" aria-hidden="true"><g stroke="#8aa783" strokeWidth=".8"><path d="m35 170 0-70 35-20 0 90m0-100 40-22 0 122m0-125 43-22 0 147m0-112 27-15 0 127M35 100l35 17 40-22 43 22 27-15M35 120l35 17 40-22 43 22 27-15M35 140l35 17 40-22 43 22 27-15M70 80l40 20m0-52 43 21M80 72v99m10-105v105m10-110v110m21-132v132m11-137v137m11-143v143M45 104v66m12-60v60m108-118v118m-25-147 42 21M110 48l43 21 27-15m-70 20 43 21 27-15" /><path d="m20 180 85-46 90 44" /><path d="M112 45V8m-35 8h90m-55-8 45 8m-70 0v45m70-45v27" /></g><path fill="#a7be8d11" d="m110 48 43 21v101l-43-22V48Z" /></svg>
    </div>
    <div className="mobile-section-title"><h2>常用工作</h2><span style={{ fontSize: 10, color: '#9aa58a' }}>随手处理，从容推进</span></div>
    <div className="mobile-shortcuts">
      {entries.slice(0, 2).map((item, index) => <button className="mobile-shortcut" key={item.key} onClick={() => ctx.navigate({ ...item.page, query: item.query })}><span className={`mobile-shortcut-icon ${index ? 'gold' : ''}`}><Icon name={item.page.moduleKey === 'schedule' ? 'schedule' : 'log'} /></span><strong>{item.label}</strong></button>)}
      <button className="mobile-shortcut" onClick={() => ctx.navigate(profileTarget)}><span className="mobile-shortcut-icon blue"><Icon name="project" /></span><strong>我的工作空间</strong></button>
    </div>
    {schedule && <>
      <div className="mobile-section-title"><h2>现场一览</h2><button onClick={() => ctx.navigate(schedule.page)}>查看计划 ↗</button></div>
      <div className="mobile-agenda">
        <button className="mobile-agenda-item" onClick={() => ctx.navigate({ moduleKey: 'schedule', pageKey: 'task-detail', query: { id: 'demo-task-01' } })}><span className="mobile-agenda-time">A 区</span><i className="mobile-agenda-dot" /><span className="mobile-agenda-copy"><strong>二层钢筋绑扎</strong><span>示例施工一组 · 进行中</span></span><span className="mobile-agenda-arrow">›</span></button>
        <button className="mobile-agenda-item" onClick={() => ctx.navigate({ moduleKey: 'schedule', pageKey: 'task-detail', query: { id: 'demo-task-02' } })}><span className="mobile-agenda-time">西侧</span><i className="mobile-agenda-dot gold" /><span className="mobile-agenda-copy"><strong>地下管线现场复核</strong><span>示例测量组 · 需要关注</span></span><span className="mobile-agenda-arrow">›</span></button>
        {logs && <button className="mobile-agenda-item" onClick={() => ctx.navigate({ moduleKey: 'customer-site-log', pageKey: 'create' })}><span className="mobile-agenda-time">现场</span><i className="mobile-agenda-dot" /><span className="mobile-agenda-copy"><strong>写下今天的施工记录</strong><span>新建一篇本地现场日志</span></span><span className="mobile-agenda-arrow">›</span></button>}
      </div>
    </>}
    <div className="mobile-home-bottom"><Icon name="leaf" /><p>进度与记录，在一个工作台里相遇。<br />当前业务内容为虚构示例，欢迎实际体验新增与跳转。</p></div>
  </section>;
}

function ProfilePage({ ctx }: MobilePageProps) {
  const { release, preview, appName, workspaceName, openWorkspace, logout, notify, reloadApp } = useHost();
  const name = String(ctx.user?.displayName || ctx.user?.username || '已登录用户');
  const verifyProfile = async () => {
    try {
      const result = await ctx.session.request<{ uuid?: string }>('/user/profile', { body: {} });
      notify(result.uuid === ctx.user?.uuid ? '当前会话已通过开发环境验证。' : '已收到开发环境响应，请检查账号资料。');
    } catch (error) { notify(error instanceof Error ? error.message : '请求失败'); }
  };
  return <section>
    <div className="mobile-profile-head"><div className="mobile-profile-avatar">{name.slice(0, 1)}</div><h1>{name}</h1><p>{preview ? '本地示例身份 · 不连接业务系统' : '已登录开发环境'}</p></div>
    <div className="mobile-profile-group">
      <button className="mobile-profile-row" onClick={openWorkspace}><Icon name="project" /><span>工作空间</span><small>{workspaceName}</small><span>›</span></button>
      <div className="mobile-profile-row"><Icon name="home" /><span>当前应用</span><small>{appName}</small></div>
      <div className="mobile-profile-row"><Icon name="grid" /><span>应用版本</span><small>{release.applicationVersion}</small></div>
      <button className="mobile-profile-row" onClick={reloadApp}><Icon name="link" /><span>重新加载源码</span><small>构建完成后刷新</small><span>›</span></button>
      {!preview && <button className="mobile-profile-row" onClick={verifyProfile}><Icon name="link" /><span>验证开发环境连接</span><span>›</span></button>}
    </div>
    <div className="mobile-profile-group">{release.modules.map((module) => <div className="mobile-profile-row" key={module.moduleKey}><Icon name={module.moduleKey === 'schedule' ? 'schedule' : 'log'} /><span>{module.moduleKey === 'schedule' ? '标准进度' : module.moduleKey === 'customer-site-log' ? '客户现场日志' : module.moduleKey}</span><small>v{module.version}</small></div>)}</div>
    <button className="mobile-secondary-button" onClick={logout}>{preview ? '退出示例，使用账号登录' : '退出登录'}</button>
    <p className="mobile-profile-note">本地联调 · 当前业务页使用样例数据<br />现场日志仅保存到当前浏览器，不上传业务系统。</p>
  </section>;
}

const hostModule: FrontendModule = {
  moduleKey: 'home', moduleName: '客户宿主',
  pages: [{ key: 'overview', label: '工作台', scope: 'both', component: HomePage }, { key: 'profile', label: '我的', scope: 'both', component: ProfilePage }],
};
const localPages = hostModule.pages.map(({ component: _, ...page }) => ({ ...page, moduleKey: hostModule.moduleKey }));

function readRoute(): PageTarget {
  const hash = window.location.hash.slice(1);
  return hash ? parsePageUrl(hash) ?? homeTarget : homeTarget;
}

class PageErrorBoundary extends React.Component<{ children: React.ReactNode; onRetry(): void }, { error: string | null }> {
  state: { error: string | null } = { error: null };
  static getDerivedStateFromError(error: unknown) { return { error: error instanceof Error ? error.message : '页面发生异常' }; }
  render() {
    if (this.state.error) return <div className="mobile-state"><h1>页面暂时无法显示</h1><p>{this.state.error}</p><button className="mobile-secondary-button" onClick={this.props.onRetry}>重新加载页面</button></div>;
    return this.props.children;
  }
}

function Login({ appName, client, onPreview }: { appName: string; client: SessionClient; onPreview(): void }) {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try { await client.login({ phone: phone.trim(), password }); setPassword(''); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '登录失败，请稍后重试'); }
    finally { setBusy(false); }
  };
  return <main className="mobile-login">
    <div className="mobile-brand-mark"><Icon name="brand" /></div><div className="mobile-login-eyebrow">WORK TOGETHER, BUILD BETTER</div><h1>{appName}<br />移动工作台</h1><p>登录你的 Nebulix 开发环境账号，<br />在浏览器中连接真实会话与工作空间。</p>
    {error && <div className="mobile-error-message" role="alert">{error}</div>}
    <form className="mobile-login-form" onSubmit={submit}><label>手机号<input type="tel" name="username" autoComplete="username" inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="请输入手机号" required /></label><label>密码<input type="password" name="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="请输入账号密码" required /></label><button className="mobile-primary-button" disabled={busy} type="submit">{busy ? '正在登录…' : '登录开发环境'}</button></form>
    <div className="mobile-login-divider">先看看移动端效果</div><button className="mobile-secondary-button" onClick={onPreview} disabled={busy}>进入本地示例</button><p className="mobile-login-foot">示例使用虚构内容，不创建云端会话或修改业务数据。</p>
  </main>;
}

interface WorkspaceItem { uuid: string; name: string }
function WorkspaceSheet({ ctx, preview, appName, onClose, onSelected }: { ctx: MobilePageContext; preview: boolean; appName: string; onClose(): void; onSelected(name: string): void }) {
  const [companies, setCompanies] = useState<WorkspaceItem[]>([]);
  const [projects, setProjects] = useState<WorkspaceItem[]>([]);
  const [company, setCompany] = useState(ctx.companyUuid || '');
  const [project, setProject] = useState(ctx.projectUuid || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    if (preview) {
      setCompanies([{ uuid: `demo-company-${ctx.appKey}`, name: `${appName} · 示例企业` }]); setProjects(demoProjects); return;
    }
    setBusy(true);
    Promise.all([
      ctx.session.request<{ list: WorkspaceItem[] }>('/company/list-mine', { body: {} }),
      ctx.companyUuid ? ctx.session.request<WorkspaceItem[]>('/project/list', { body: {} }) : Promise.resolve([]),
    ]).then(([companyList, projectList]) => { if (active) { setCompanies(companyList.list); setProjects(projectList); } })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : '工作空间读取失败'); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [preview, ctx.session, ctx.appKey]);
  const changeCompany = async (value: string) => {
    setCompany(value); setProject(''); setProjects([]); setError('');
    if (!value) return;
    if (preview) { setProjects(demoProjects); return; }
    setBusy(true);
    try { await ctx.session.setWorkspace({ companyUuid: value }); setProjects(await ctx.session.request<WorkspaceItem[]>('/project/list', { body: {} })); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '企业切换失败'); }
    finally { setBusy(false); }
  };
  const apply = async () => {
    if (!company) { setError('请选择一个企业。'); return; }
    setBusy(true); setError('');
    try { await ctx.session.setWorkspace({ companyUuid: company, projectUuid: project || undefined }); onSelected(projects.find((item) => item.uuid === project)?.name || companies.find((item) => item.uuid === company)?.name || '企业工作空间'); onClose(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '工作空间切换失败'); }
    finally { setBusy(false); }
  };
  return <div className="mobile-sheet-backdrop" onClick={onClose}><section className="mobile-sheet" role="dialog" aria-modal="true" aria-labelledby="mobile-workspace-title" onClick={(event) => event.stopPropagation()}>
    <div className="mobile-sheet-head"><h2 id="mobile-workspace-title">选择工作空间</h2><button aria-label="关闭工作空间选择" onClick={onClose}>×</button></div><p>{preview ? '切换示例项目后，本地日志也会分开保存。' : '选择账号有权访问的企业与项目。切换企业会更新当前登录上下文。'}</p>
    {error && <div className="mobile-error-message" role="alert">{error}</div>}
    <label>企业<select value={company} onChange={(event) => void changeCompany(event.target.value)} disabled={busy}><option value="">请选择企业</option>{companies.map((item) => <option key={item.uuid} value={item.uuid}>{item.name}</option>)}</select></label>
    <label>项目<select value={project} onChange={(event) => setProject(event.target.value)} disabled={busy || !company}><option value="">企业空间（不选项目）</option>{projects.map((item) => <option key={item.uuid} value={item.uuid}>{item.name}</option>)}</select></label>
    <button className="mobile-primary-button" onClick={apply} disabled={busy}>{busy ? '正在读取…' : '进入工作空间'}</button>
  </section></div>;
}

interface DevelopmentEnvironment { apiBaseUrl: string; productHost?: string }

export function MobileApp() {
  const [environment, setEnvironment] = useState<DevelopmentEnvironment | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    document.title = h5Config.title;
    (async () => {
      try {
        const response = await fetch('/__mobile/environment', { signal: controller.signal });
        const payload = await response.json();
        if (!response.ok || payload.success !== true) throw new Error(payload.error?.message || '无法读取本地联调环境。');
        const value = payload.data;
        if (!value || typeof value.apiBaseUrl !== 'string' || !value.apiBaseUrl.startsWith('/') || value.apiBaseUrl.startsWith('//')) throw new Error('联调 API 地址无效。');
        const api = new URL(value.apiBaseUrl, location.origin);
        if (api.origin !== location.origin || api.search || api.hash) throw new Error('联调 API 必须使用同源代理。');
        if (value.productHost !== undefined && (typeof value.productHost !== 'string' || !/^[a-z0-9.-]+(?::[0-9]+)?$/i.test(value.productHost))) throw new Error('联调环境域名无效。');
        if (!controller.signal.aborted) setEnvironment({ apiBaseUrl: api.pathname, productHost: value.productHost });
      } catch (reason) {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '本地联调环境暂时不可用。');
      }
    })();
    return () => controller.abort();
  }, []);
  if (!environment) return <div className="mobile-app"><div className="mobile-frame"><div className="mobile-state">
    {error ? <><h1>暂时无法打开现场助手</h1><p>{error}</p><button className="mobile-secondary-button" onClick={() => location.reload()}>重新加载</button></>
      : <><div className="mobile-spinner" /><p>正在连接本地联调环境…</p></>}
  </div></div></div>;
  return <MobileHost environment={environment} />;
}

function MobileHost({ environment }: { environment: DevelopmentEnvironment }) {
  const appKey = h5Config.storageNamespace;
  const appName = h5Config.title;
  const [preview, setPreview] = useState(() => new URLSearchParams(location.search).get('preview') === '1');
  const realSession = useMemo(() => createSessionClient({ baseUrl: environment.apiBaseUrl, appKey, productHost: environment.productHost, storage: localStorage }), [appKey, environment.apiBaseUrl, environment.productHost]);
  const previewSession = useMemo(() => createPreviewSession(appKey), [appKey]);
  const session = preview ? previewSession : realSession;
  const snapshot = useMobileSession(session);
  const bridge = useMemo(() => createBrowserBridge(), []);
  const guard = useMemo(() => createNavigationGuard(), []);
  const [runtime, setRuntime] = useState<ModuleRuntime | null>(null);
  const [initializationError, setInitializationError] = useState('');
  const [route, setRoute] = useState<PageTarget>(() => { try { return readRoute(); } catch { return homeTarget; } });
  const routeRef = useRef(route); routeRef.current = route;
  const [page, setPage] = useState<MobilePageDef | null>(null);
  const [pageError, setPageError] = useState('');
  const [pageErrorCode, setPageErrorCode] = useState('');
  const [retry, setRetry] = useState(0);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [workspaceName, setWorkspaceName] = useState(preview
    ? demoProjects.find((item) => item.uuid === snapshot.projectUuid)?.name || `${appName} · 示例企业`
    : '当前工作空间');
  const [toast, setToast] = useState('');
  const [leavePromptOpen, setLeavePromptOpen] = useState(false);
  const leaveResolver = useRef<((allowed: boolean) => void) | null>(null);
  const notify = useCallback((value: string) => setToast(value), []);
  const changePreview = useCallback((value: boolean) => {
    const next = new URL(location.href);
    if (value) next.searchParams.set('preview', '1');
    else next.searchParams.delete('preview');
    history.replaceState({}, '', `${next.pathname}${next.search}${next.hash}`);
    setPreview(value);
    setWorkspaceName(value
      ? demoProjects.find((item) => item.uuid === previewSession.getSnapshot().projectUuid)?.name || `${appName} · 示例企业`
      : '当前工作空间');
  }, [appKey, appName, previewSession]);
  useEffect(() => { if (!preview) void realSession.restore().catch((reason) => notify(reason instanceof Error ? reason.message : '登录状态已失效')); }, [realSession, preview]);
  useEffect(() => () => {
    realSession.dispose();
    previewSession.dispose();
  }, [realSession, previewSession]);
  useEffect(() => () => {
    const resolve = leaveResolver.current;
    leaveResolver.current = null;
    resolve?.(false);
  }, []);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 4500); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => {
    let owned: ModuleRuntime | null = null;
    try {
      // AppRelease is the SDK's internal composition contract. This descriptor
      // is created from checked-in source; no management or publishing service is involved.
      const input: AppRelease = {
        schemaVersion: 1,
        appKey,
        releaseId: `source-${h5Config.version}`,
        applicationVersion: h5Config.version,
        runtimeApiVersion: '1',
        modules: h5Config.modules,
        navigation: h5Config.navigation,
      };
      owned = createModuleRuntime(validateRelease(input, { baseUrl: location.href, localPages, allowedOrigins: h5Config.allowedModuleOrigins }));
      owned.registerLocalModule(hostModule);
      setRuntime(owned);
      setInitializationError('');
    } catch (reason) {
      setInitializationError(configurationError(reason, 'H5 源码配置无效。'));
    }
    return () => owned?.dispose();
  }, [appKey]);
  const settleLeavePrompt = useCallback((allowed: boolean) => {
    const resolve = leaveResolver.current;
    leaveResolver.current = null;
    setLeavePromptOpen(false);
    resolve?.(allowed);
  }, []);
  const canLeave = useCallback(() => {
    // Never replace the navigation target of a confirmation already in progress.
    if (leaveResolver.current) return Promise.resolve(false);
    return guard.canLeave(() => new Promise<boolean>((resolve) => {
      leaveResolver.current = resolve;
      setLeavePromptOpen(true);
    }));
  }, [guard]);
  const reloadApp = useCallback(async () => {
    if (!(await canLeave())) return;
    // Preserve the deep link and explicit preview switch after confirming edits.
    guard.clear();
    location.reload();
  }, [canLeave, guard]);
  const navigate = useCallback(async (target: PageTarget) => {
    const url = buildPageUrl(target);
    if (!(await canLeave())) return false;
    history.pushState({}, '', `${location.pathname}${location.search}#${url}`);
    setRoute(target); setPage(null); setPageError(''); window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    return true;
  }, [canLeave]);
  useEffect(() => {
    let listening = true;
    const handler = async () => {
      try {
        const next = readRoute();
        if (JSON.stringify(next) === JSON.stringify(routeRef.current)) return;
        const allowed = await canLeave();
        if (!listening) return;
        if (!allowed) { history.replaceState({}, '', `${location.pathname}${location.search}#${buildPageUrl(routeRef.current)}`); return; }
        // popstate and hashchange may both fire for one browser-back action.
        // A rejected duplicate must not leave an accepted route at the old URL.
        history.replaceState({}, '', `${location.pathname}${location.search}#${buildPageUrl(next)}`);
        setRoute(next); setPage(null); window.scrollTo(0, 0);
      } catch (reason) { setPageError(reason instanceof Error ? reason.message : '页面地址无效'); }
    };
    const beforeUnload = (event: BeforeUnloadEvent) => { if (guard.isDirty()) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('popstate', handler); window.addEventListener('hashchange', handler); window.addEventListener('beforeunload', beforeUnload);
    return () => { listening = false; window.removeEventListener('popstate', handler); window.removeEventListener('hashchange', handler); window.removeEventListener('beforeunload', beforeUnload); };
  }, [canLeave, guard]);
  useEffect(() => {
    if (!runtime || snapshot.status !== 'authenticated') return;
    let active = true; setPage(null); setPageError(''); setPageErrorCode('');
    (async () => {
      try {
        const metadata = runtime.listPages().find((item) => item.moduleKey === route.moduleKey && item.key === route.pageKey);
        if (!metadata) throw new Error('当前 H5 源码配置没有包含这个页面。');
        assertPageContext(metadata.scope, snapshot);
        const loaded = await runtime.loadPage(route.moduleKey, route.pageKey, { retry: retry > 0 });
        if (active) setPage(loaded);
      } catch (reason) {
        if (!active) return; setPageError(configurationError(reason, '页面加载失败'));
        setPageErrorCode(String((reason as { code?: string })?.code || ''));
      }
    })();
    return () => { active = false; };
  }, [runtime, route, snapshot.epoch, snapshot.status, retry]);
  const openWorkspace = useCallback(async () => { if (await canLeave()) setWorkspaceOpen(true); }, [canLeave]);
  const logout = useCallback(async () => { if (!(await canLeave())) return; guard.clear(); realSession.logout(); changePreview(false); setPage(null); }, [canLeave, realSession, changePreview, guard]);
  const ctx: MobilePageContext = {
    appKey, releaseId: runtime?.release.releaseId || '', moduleKey: route.moduleKey, pageKey: route.pageKey,
    user: snapshot.user, companyUuid: snapshot.companyUuid, projectUuid: snapshot.projectUuid, epoch: snapshot.epoch,
    session, bridge, navigate, registerDirty: guard.register,
  };
  const Page = page?.component;
  const nav = runtime ? runtime.release.navigation : [];
  const showContextRequired = pageErrorCode === 'COMPANY_REQUIRED' || pageErrorCode === 'PROJECT_REQUIRED';
  return <div className="mobile-app"><div className="mobile-frame">
    {initializationError ? <div className="mobile-state"><Icon name="project" width={35} height={35} /><h1>暂时无法打开现场助手</h1><p>{initializationError}</p><button className="mobile-secondary-button" onClick={() => location.reload()}>重新加载</button></div>
      : !runtime ? <div className="mobile-state"><div className="mobile-spinner" /><p>正在准备现场助手…</p></div>
        : snapshot.status === 'restoring' ? <div className="mobile-state"><div className="mobile-spinner" /><p>正在验证登录状态…</p></div>
          : snapshot.status !== 'authenticated' ? <Login appName={appName} client={realSession} onPreview={() => changePreview(true)} />
            : <HostContext.Provider value={{ release: runtime.release, preview, appName, workspaceName, openWorkspace, logout, notify, reloadApp }}>
              <MobileRuntimeProvider value={ctx}>
                <header className="mobile-app-header"><div className="mobile-brand-mark"><Icon name="brand" /></div><div className="mobile-app-header-main"><div className="mobile-brand-text">{appName}</div><button className="mobile-workspace-trigger" onClick={openWorkspace}><span>{snapshot.projectUuid ? workspaceName : '选择企业 / 项目'}</span><Icon name="down" /></button></div><button className="mobile-header-button" aria-label="我的账号" onClick={() => navigate(profileTarget)}>{String(snapshot.user?.displayName || snapshot.user?.username || '我').slice(0, 1)}</button></header>
                <div className="mobile-sample-strip"><span><i />{preview ? '本地示例' : '开发环境会话'} · 业务页使用虚构数据</span><span>LOCAL SOURCE</span></div>
                <main className="mobile-content">
                  {pageError ? <div className="mobile-state"><h1>{showContextRequired ? '先选择工作空间' : '页面暂时无法显示'}</h1><p>{pageError}</p><button className="mobile-primary-button" onClick={showContextRequired ? openWorkspace : () => setRetry((value) => value + 1)}>{showContextRequired ? '选择企业 / 项目' : '重试加载'}</button><button className="mobile-secondary-button" onClick={() => navigate(homeTarget)}>返回工作台</button></div>
                    : Page ? <PageErrorBoundary key={`${runtime.release.releaseId}:${route.moduleKey}:${route.pageKey}:${snapshot.epoch}:${retry}`} onRetry={() => setRetry((value) => value + 1)}><Page ctx={ctx} params={route.query || {}} /></PageErrorBoundary>
                      : <div className="mobile-state"><div className="mobile-spinner" /><p>正在加载页面…</p></div>}
                </main>
                <nav className="mobile-bottom-nav" aria-label="移动页面导航">{nav.map((item) => {
                  const active = route.moduleKey === item.page.moduleKey && (item.page.moduleKey !== 'home' || route.pageKey === item.page.pageKey);
                  const name = item.page.moduleKey === 'home' ? item.page.pageKey === 'profile' ? 'profile' : 'home' : item.page.moduleKey === 'schedule' ? 'schedule' : item.page.moduleKey === 'customer-site-log' ? 'log' : 'grid';
                  return <button key={item.key} className={active ? 'is-active' : ''} aria-current={active ? 'page' : undefined} onClick={() => navigate({ ...item.page, query: 'query' in item ? item.query : undefined })}><Icon name={name} /><span>{item.label}</span></button>;
                })}</nav>
                {workspaceOpen && <WorkspaceSheet ctx={ctx} preview={preview} appName={appName} onClose={() => setWorkspaceOpen(false)} onSelected={setWorkspaceName} />}
              </MobileRuntimeProvider>
            </HostContext.Provider>}
    {toast && <div className="mobile-toast" role="status">{toast}</div>}
    {leavePromptOpen && <div className="mobile-sheet-backdrop mobile-leave-backdrop" onClick={() => settleLeavePrompt(false)}>
      <section className="mobile-sheet mobile-leave-dialog" role="alertdialog" aria-modal="true" aria-labelledby="mobile-leave-title" aria-describedby="mobile-leave-description"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Escape') { event.preventDefault(); settleLeavePrompt(false); }
          if (event.key === 'Tab') {
            const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button'));
            const first = buttons[0]; const last = buttons[buttons.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
          }
        }}>
        <div className="mobile-sheet-head"><h2 id="mobile-leave-title">还有内容没有保存</h2></div>
        <p id="mobile-leave-description">离开后，当前未保存的修改将丢失。你可以继续编辑并保存，再完成这次操作。</p>
        <div className="mobile-leave-actions">
          <button className="mobile-primary-button" autoFocus onClick={() => settleLeavePrompt(false)}>继续编辑</button>
          <button className="mobile-secondary-button" onClick={() => settleLeavePrompt(true)}>放弃修改并离开</button>
        </div>
      </section>
    </div>}
  </div></div>;
}

export default MobileApp;
