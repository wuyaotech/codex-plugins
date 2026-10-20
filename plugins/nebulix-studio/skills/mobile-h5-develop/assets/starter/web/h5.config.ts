import type { AppRelease, ModuleArtifact } from '@nebulix/mobile-sdk';

export interface H5Configuration {
  title: string;
  /** Keep this stable to retain existing account sessions and local example records. */
  storageNamespace: string;
  version: string;
  /** Explicitly trusted remote module origins, e.g. https://modules.example.com. */
  allowedModuleOrigins: string[];
  navigation: AppRelease['navigation'];
  modules: ModuleArtifact[];
  /** Paths are relative to this H5 package root; remote modules need no local source. */
  localSources: Record<string, string>;
}

/** Compose the H5 directly in source. Each module exports the public frontendModule contract. */
export const h5Config: H5Configuration = {
  title: '澄明现场助手',
  storageNamespace: 'aurora',
  version: '0.1.0',
  allowedModuleOrigins: [],
  localSources: {
    schedule: 'examples/schedule/index.tsx',
    'customer-site-log': 'examples/site-log/index.tsx',
  },
  navigation: [
    { key: 'home', label: '工作台', page: { moduleKey: 'home', pageKey: 'overview' } },
    { key: 'schedule', label: '进度', page: { moduleKey: 'schedule', pageKey: 'overview' } },
    { key: 'site-log', label: '现场日志', page: { moduleKey: 'customer-site-log', pageKey: 'list' } },
    { key: 'profile', label: '我的', page: { moduleKey: 'home', pageKey: 'profile' } },
  ],
  modules: [
    {
      moduleKey: 'schedule',
      target: 'mobile',
      version: '1.1.0',
      entry: '/modules/schedule/entry.js',
      runtimeApiVersion: '1',
      pages: [
        { key: 'overview', label: '进度总览', scope: 'project' },
        { key: 'task-detail', label: '任务详情', scope: 'project' },
      ],
    },
    {
      moduleKey: 'customer-site-log',
      target: 'mobile',
      version: '1.0.1',
      entry: '/modules/customer-site-log/entry.js',
      runtimeApiVersion: '1',
      pages: [
        { key: 'list', label: '现场日志', scope: 'project' },
        { key: 'create', label: '新建日志', scope: 'project' },
        { key: 'detail', label: '日志详情', scope: 'project' },
      ],
    },
  ],
};
