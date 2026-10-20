import type { ComponentType } from 'react';

export const MOBILE_RUNTIME_API_VERSION = '1' as const;
export type PageScope = 'company' | 'project' | 'both';
export interface PageTarget {
  moduleKey: string;
  pageKey: string;
  query?: Record<string, string>;
}
export interface PageMetadata { key: string; label: string; scope: PageScope }
export interface MobilePageDef extends PageMetadata { component: ComponentType<MobilePageProps> }
export interface FrontendModule { moduleKey: string; moduleName?: string; pages: MobilePageDef[] }
export interface ModuleArtifact {
  moduleKey: string;
  target: 'mobile';
  version: string;
  entry: string;
  runtimeApiVersion: '1';
  pages: PageMetadata[];
}
/** Compatibility name for the client runtime manifest, supplied by H5 source
 * or a trusted deployment manifest. No application registry or publishing API is required. */
export interface AppRelease {
  schemaVersion: 1;
  /** Stable client storage namespace; never a tenant identifier or authorization grant. */
  appKey: string;
  releaseId: string;
  applicationVersion: string;
  runtimeApiVersion: '1';
  modules: ModuleArtifact[];
  navigation: Array<{ key: string; label: string; page: Omit<PageTarget, 'query'>; query?: Record<string, string> }>;
}
declare const validatedRelease: unique symbol;
export type ValidatedRelease = Readonly<AppRelease> & { readonly [validatedRelease]: true };
export interface MobileUser {
  uuid: string;
  username?: string;
  displayName?: string;
  lastCompanyUuid?: string | null;
  lastProjectUuid?: string | null;
  [key: string]: unknown;
}
export interface SessionSnapshot {
  status: 'anonymous' | 'restoring' | 'authenticated';
  user: MobileUser | null;
  companyUuid?: string;
  projectUuid?: string;
  epoch: number;
}
export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}
export interface SessionClient {
  getSnapshot(): SessionSnapshot;
  subscribe(listener: () => void): () => void;
  login(credentials: { phone: string; password: string }): Promise<SessionSnapshot>;
  restore(): Promise<SessionSnapshot>;
  logout(): void;
  setWorkspace(workspace: { companyUuid: string; projectUuid?: string }): Promise<SessionSnapshot>;
  request<T = unknown>(path: string, options?: ApiRequestOptions): Promise<T>;
  dispose(): void;
}
export interface MobileBridge {
  platform: 'browser';
  capabilities(): Promise<Record<string, boolean>>;
  getLocation(options?: { timeout?: number; signal?: AbortSignal }): Promise<{
    latitude: number; longitude: number; accuracy: number; timestamp: number; coordinateSystem: 'WGS84';
  }>;
  pickFiles(options?: { accept?: string; multiple?: boolean; capture?: 'user' | 'environment'; signal?: AbortSignal }): Promise<File[]>;
  scan(): Promise<string>;
}
export interface MobilePageContext {
  /** Client namespace retained across local module navigation. */
  appKey: string;
  releaseId: string;
  moduleKey: string;
  pageKey: string;
  user: MobileUser | null;
  companyUuid?: string;
  projectUuid?: string;
  epoch: number;
  session: SessionClient;
  bridge: MobileBridge;
  navigate(target: PageTarget): void | Promise<boolean>;
  registerDirty(check: () => boolean): () => void;
}
export interface MobilePageProps { ctx: MobilePageContext; params: Record<string, string> }
