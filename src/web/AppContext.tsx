import {
  createContext,
  useCallback,
  useContext,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { translate, type Lang, type MessageKey, type Params } from './i18n/i18n';
import type { Connection } from './net/connection';
import type { AppState } from './store/appState';
import type { Store } from './store/store';

export interface AppServices {
  store: Store<AppState>;
  connection: Connection;
}

const AppContext = createContext<AppServices | null>(null);

export function AppProvider({
  services,
  children,
}: {
  services: AppServices;
  children: ReactNode;
}) {
  return <AppContext.Provider value={services}>{children}</AppContext.Provider>;
}

export function useServices(): AppServices {
  const services = useContext(AppContext);
  if (!services) throw new Error('AppProvider is missing');
  return services;
}

/** Subscribes to a slice of the store; re-renders only when the selected value changes. */
export function useAppState<T>(selector: (state: AppState) => T): T {
  const { store } = useServices();
  const getSnapshot = useCallback(() => selector(store.getState()), [store, selector]);
  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}

export type TFunction = (key: MessageKey, params?: Params) => string;

export function useLang(): Lang {
  return useAppState(selectLang);
}

/** Translation function bound to the current language; components re-render when it changes. */
export function useT(): TFunction {
  const lang = useLang();
  return useCallback((key, params) => translate(lang, key, params), [lang]);
}

const selectLang = (s: AppState) => s.lang;
