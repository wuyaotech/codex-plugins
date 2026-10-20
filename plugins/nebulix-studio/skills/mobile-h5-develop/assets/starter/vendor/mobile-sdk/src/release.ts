import { MobileSdkError } from './errors';
import type { AppRelease, PageMetadata, ValidatedRelease } from './types';

const verified = new WeakSet<object>();
const identifier = /^[a-z][a-z0-9-]{0,63}$/;
export function assertIdentifier(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !identifier.test(value)) throw new MobileSdkError('INVALID_IDENTIFIER', `${label} 必须为小写字母开头的字母、数字或短横线`);
}
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function nonempty(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !value.trim()) throw new MobileSdkError('INVALID_RELEASE', `${label} 不能为空`);
}
export function assertPageMetadata(page: unknown): asserts page is PageMetadata {
  if (!record(page)) throw new MobileSdkError('INVALID_PAGE', '页面描述无效');
  assertIdentifier(page.key, 'pageKey');
  nonempty(page.label, '页面名称');
  if (!['company', 'project', 'both'].includes(String(page.scope))) throw new MobileSdkError('INVALID_SCOPE', `页面 ${page.key} 缺少有效 scope`);
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) freeze(item);
    Object.freeze(value);
  }
  return value;
}
/** Validate a trusted source/deployment manifest before importing executable modules.
 * This checks structure/origins, not publisher signatures or a JS security sandbox. */
export function validateRelease(input: unknown, options: {
  baseUrl: string;
  allowedOrigins?: string[];
  /** Host-owned pages may appear in navigation without a remote artifact. */
  localPages?: Array<PageMetadata & { moduleKey: string }>;
}): ValidatedRelease {
  if (!record(input) || input.schemaVersion !== 1 || input.runtimeApiVersion !== '1') throw new MobileSdkError('INCOMPATIBLE_RUNTIME', '运行清单需要移动运行时 API 1');
  assertIdentifier(input.appKey, 'appKey');
  nonempty(input.releaseId, 'releaseId');
  nonempty(input.applicationVersion, 'applicationVersion');
  if (!Array.isArray(input.modules) || !Array.isArray(input.navigation)) throw new MobileSdkError('INVALID_RELEASE', '缺少模块或导航列表');
  const base = new URL(options.baseUrl);
  const origins = new Set([base.origin, ...(options.allowedOrigins ?? []).map(origin => new URL(origin).origin)]);
  const moduleKeys = new Set<string>();
  const pageKeys = new Set<string>();
  const localModuleKeys = new Set<string>();
  for (const page of options.localPages ?? []) {
    assertPageMetadata(page); assertIdentifier(page.moduleKey, 'moduleKey');
    const key = `${page.moduleKey}/${page.key}`;
    if (pageKeys.has(key)) throw new MobileSdkError('DUPLICATE_PAGE', `重复本地页面 ${key}`);
    pageKeys.add(key); localModuleKeys.add(page.moduleKey);
  }
  const modules = input.modules.map(value => {
    if (!record(value)) throw new MobileSdkError('INVALID_MODULE', '模块描述无效');
    assertIdentifier(value.moduleKey, 'moduleKey');
    if (moduleKeys.has(value.moduleKey) || localModuleKeys.has(value.moduleKey)) throw new MobileSdkError('DUPLICATE_MODULE', `重复模块 ${value.moduleKey}`);
    moduleKeys.add(value.moduleKey);
    if (value.target !== 'mobile' || value.runtimeApiVersion !== '1') throw new MobileSdkError('INCOMPATIBLE_RUNTIME', `模块 ${value.moduleKey} 不是兼容的移动产物`);
    nonempty(value.version, '模块版本'); nonempty(value.entry, '模块入口');
    const entry = new URL(value.entry, base);
    const localHttp = entry.protocol === 'http:' && (['localhost', '127.0.0.1', '[::1]'].includes(entry.hostname) || entry.hostname.endsWith('.localhost'));
    if ((entry.protocol !== 'https:' && !localHttp) || entry.username || entry.password || entry.hash || !origins.has(entry.origin)) {
      throw new MobileSdkError('UNTRUSTED_ENTRY', `模块 ${value.moduleKey} 的入口来源未获允许`);
    }
    if (!Array.isArray(value.pages) || !value.pages.length) throw new MobileSdkError('INVALID_MODULE', '模块至少声明一个页面');
    const pages = value.pages.map(page => {
      assertPageMetadata(page);
      const key = `${value.moduleKey}/${page.key}`;
      if (pageKeys.has(key)) throw new MobileSdkError('DUPLICATE_PAGE', `重复页面 ${key}`);
      pageKeys.add(key);
      return { key: page.key, label: page.label, scope: page.scope };
    });
    return { moduleKey: value.moduleKey, target: 'mobile' as const, version: value.version, entry: entry.href, runtimeApiVersion: '1' as const, pages };
  });
  const navigationKeys = new Set<string>();
  const navigation = input.navigation.map(value => {
    if (!record(value) || !record(value.page)) throw new MobileSdkError('INVALID_NAVIGATION', '导航目标无效');
    assertIdentifier(value.key, 'navigationKey'); nonempty(value.label, '导航名称');
    assertIdentifier(value.page.moduleKey, 'moduleKey'); assertIdentifier(value.page.pageKey, 'pageKey');
    if (navigationKeys.has(value.key)) throw new MobileSdkError('DUPLICATE_NAVIGATION', `重复导航 ${value.key}`);
    navigationKeys.add(value.key);
    if (!pageKeys.has(`${value.page.moduleKey}/${value.page.pageKey}`)) throw new MobileSdkError('MISSING_PAGE', '导航引用不存在的模块页面');
    const query = value.query == null ? undefined : validateQuery(value.query);
    return { key: value.key, label: value.label, page: { moduleKey: value.page.moduleKey, pageKey: value.page.pageKey }, ...(query ? { query } : {}) };
  });
  const release: AppRelease = { schemaVersion: 1, appKey: input.appKey, releaseId: input.releaseId, applicationVersion: input.applicationVersion, runtimeApiVersion: '1', modules, navigation };
  freeze(release); verified.add(release);
  return release as ValidatedRelease;
}
export function assertValidatedRelease(release: ValidatedRelease): void {
  if (!verified.has(release)) throw new MobileSdkError('UNVALIDATED_RELEASE', '模块只能从已验证的运行清单加载');
}
export function validateQuery(value: unknown): Record<string, string> {
  if (!record(value)) throw new MobileSdkError('INVALID_QUERY', '路由参数必须为字符串字典');
  const result: Record<string, string> = Object.create(null);
  for (const [key, item] of Object.entries(value)) {
    if (!key || /token|password|secret|authorization/i.test(key) || typeof item !== 'string') throw new MobileSdkError('INVALID_QUERY', '路由参数不能包含凭证或非字符串值');
    result[key] = item;
  }
  return result;
}
