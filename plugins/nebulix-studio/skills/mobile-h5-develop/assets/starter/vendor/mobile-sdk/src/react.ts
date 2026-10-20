import { createContext, createElement, useContext, useSyncExternalStore, type ReactNode } from 'react';
import { MobileSdkError } from './errors';
import type { MobilePageContext, SessionClient } from './types';
const RuntimeContext = createContext<MobilePageContext | null>(null);
export function MobileRuntimeProvider({ value, children }: { value: MobilePageContext; children: ReactNode }) {
  return createElement(RuntimeContext.Provider, { value }, children);
}
export function useMobileRuntime(): MobilePageContext {
  const context = useContext(RuntimeContext);
  if (!context) throw new MobileSdkError('MISSING_PROVIDER', '页面需要 MobileRuntimeProvider');
  return context;
}
export function useMobileSession(client: SessionClient) {
  return useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
}
