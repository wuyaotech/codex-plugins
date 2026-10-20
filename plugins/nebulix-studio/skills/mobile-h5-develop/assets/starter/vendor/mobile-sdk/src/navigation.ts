import { MobileSdkError } from './errors';
import { assertIdentifier, validateQuery } from './release';
import type { PageTarget, PageScope, SessionSnapshot } from './types';

export function buildPageUrl(target: PageTarget): string {
  assertIdentifier(target.moduleKey, 'moduleKey'); assertIdentifier(target.pageKey, 'pageKey');
  const query = new URLSearchParams(validateQuery(target.query ?? {})).toString();
  return `/modules/${target.moduleKey}/${target.pageKey}${query ? `?${query}` : ''}`;
}
export function parsePageUrl(value: string): PageTarget | null {
  const url = new URL(value, 'https://mobile.invalid');
  const match = url.pathname.match(/^\/modules\/([^/]+)\/([^/]+)\/?$/);
  if (!match) return null;
  assertIdentifier(match[1], 'moduleKey'); assertIdentifier(match[2], 'pageKey');
  const query: Record<string, string> = Object.create(null);
  for (const [key, item] of url.searchParams) {
    if (key in query) throw new MobileSdkError('INVALID_QUERY', `重复路由参数 ${key}`);
    query[key] = item;
  }
  return { moduleKey: match[1], pageKey: match[2], query: validateQuery(query) };
}
export function assertPageContext(scope: PageScope, session: SessionSnapshot): void {
  if (session.status !== 'authenticated' || !session.user) throw new MobileSdkError('LOGIN_REQUIRED', '请先登录');
  if (!session.companyUuid) throw new MobileSdkError('COMPANY_REQUIRED', '请先选择企业');
  if (scope === 'project' && !session.projectUuid) throw new MobileSdkError('PROJECT_REQUIRED', '请先选择项目');
}
export function createNavigationGuard() {
  const checks = new Set<() => boolean>();
  const isDirty = () => [...checks].some(check => { try { return check(); } catch { return true; } });
  return {
    register(check: () => boolean) { checks.add(check); return () => { checks.delete(check); }; },
    isDirty,
    async canLeave(confirm?: () => boolean | Promise<boolean>) { return !isDirty() || (confirm ? await confirm() : false); },
    clear() { checks.clear(); },
  };
}
