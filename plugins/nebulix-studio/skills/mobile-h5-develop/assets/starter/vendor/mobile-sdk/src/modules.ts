import { MobileSdkError } from './errors';
import { assertIdentifier, assertPageMetadata, assertValidatedRelease } from './release';
import type { FrontendModule, MobilePageDef, PageMetadata, ValidatedRelease } from './types';

export interface RegisteredPage extends PageMetadata { moduleKey: string; source: 'local' | 'remote' }
export function createModuleRuntime(release: ValidatedRelease, options: { importModule?: (entry: string) => Promise<unknown> } = {}) {
  assertValidatedRelease(release);
  const importModule = options.importModule ?? (entry => import(/* @vite-ignore */ entry));
  const modules = new Map<string, FrontendModule>();
  const pending = new Map<string, Promise<FrontendModule>>();
  const failures = new Map<string, unknown>();
  let disposed = false;
  const assertActive = () => { if (disposed) throw new MobileSdkError('DISPOSED', '模块运行时已销毁'); };
  function listPages(): RegisteredPage[] {
    assertActive();
    return [
      ...release.modules.flatMap(module => module.pages.map(page => ({ ...page, moduleKey: module.moduleKey, source: 'remote' as const }))),
      ...[...modules.values()].filter(module => !release.modules.some(item => item.moduleKey === module.moduleKey))
        .flatMap(module => module.pages.map(({ component: _, ...page }) => ({ ...page, moduleKey: module.moduleKey, source: 'local' as const }))),
    ];
  }
  function validateModule(value: unknown, expectedKey: string, expectedPages?: readonly PageMetadata[]): FrontendModule {
    const root = value as { default?: unknown; frontendModule?: unknown } | null;
    const exported = (root?.default ?? root) as { frontendModule?: unknown } | null;
    const module = (exported?.frontendModule ?? exported) as FrontendModule | null;
    if (!module || module.moduleKey !== expectedKey || !Array.isArray(module.pages)) throw new MobileSdkError('INVALID_MODULE_EXPORT', `模块入口与 ${expectedKey} 不一致`);
    const seen = new Set<string>();
    const pages = module.pages.map(page => {
      assertPageMetadata(page);
      if (seen.has(page.key)) throw new MobileSdkError('DUPLICATE_PAGE', `重复页面 ${expectedKey}/${page.key}`);
      seen.add(page.key);
      if (typeof page.component !== 'function' && !(page.component && typeof page.component === 'object' && '$$typeof' in page.component)) {
        throw new MobileSdkError('INVALID_COMPONENT', `页面 ${page.key} 缺少 React 组件`);
      }
      return Object.freeze({ key: page.key, label: page.label, scope: page.scope, component: page.component });
    });
    if (expectedPages && (pages.length !== expectedPages.length || expectedPages.some(expected => {
      const actual = pages.find(page => page.key === expected.key);
      return !actual || actual.scope !== expected.scope || actual.label !== expected.label;
    }))) throw new MobileSdkError('PAGE_MANIFEST_MISMATCH', `模块 ${expectedKey} 页面与源码配置不一致`);
    return Object.freeze({ moduleKey: expectedKey, moduleName: module.moduleName, pages: Object.freeze(pages) as unknown as MobilePageDef[] });
  }
  async function loadModule(moduleKey: string, retry: boolean) {
    assertActive();
    if (modules.has(moduleKey)) return modules.get(moduleKey)!;
    if (pending.has(moduleKey)) return pending.get(moduleKey)!;
    if (failures.has(moduleKey) && !retry) throw failures.get(moduleKey);
    const artifact = release.modules.find(item => item.moduleKey === moduleKey);
    if (!artifact) throw new MobileSdkError('MISSING_MODULE', `未配置模块 ${moduleKey}`);
    failures.delete(moduleKey);
    const task = Promise.resolve().then(() => importModule(artifact.entry)).then(value => {
      assertActive();
      const module = validateModule(value, moduleKey, artifact.pages);
      modules.set(moduleKey, module);
      return module;
    }).catch(error => { failures.set(moduleKey, error); throw error; }).finally(() => pending.delete(moduleKey));
    pending.set(moduleKey, task);
    return task;
  }
  return {
    release,
    listPages,
    registerLocalModule(module: FrontendModule) {
      assertActive(); assertIdentifier(module.moduleKey, 'moduleKey');
      if (modules.has(module.moduleKey) || release.modules.some(item => item.moduleKey === module.moduleKey)) throw new MobileSdkError('DUPLICATE_MODULE', `模块 ${module.moduleKey} 已登记`);
      modules.set(module.moduleKey, validateModule(module, module.moduleKey));
    },
    async loadPage(moduleKey: string, pageKey: string, options: { retry?: boolean } = {}): Promise<MobilePageDef> {
      assertIdentifier(moduleKey, 'moduleKey'); assertIdentifier(pageKey, 'pageKey');
      const metadata = listPages().find(page => page.moduleKey === moduleKey && page.key === pageKey);
      if (!metadata) throw new MobileSdkError('MISSING_PAGE', `未登记页面 ${moduleKey}/${pageKey}`);
      const module = await loadModule(moduleKey, options.retry === true);
      return module.pages.find(page => page.key === pageKey)!;
    },
    dispose() { disposed = true; modules.clear(); pending.clear(); failures.clear(); },
  };
}
export type ModuleRuntime = ReturnType<typeof createModuleRuntime>;
