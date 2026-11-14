// Connection manager: session check -> WebSocket with backoff -> store updates. The store is the
// only thing the UI reads; this module is the only thing that writes network results into it.

import type { ActivityItem } from '../../shared/contracts';
import { hasStoredLang, storeLang, type Lang } from '../i18n/i18n';
import { applyServerMessage, type AppState } from '../store/appState';
import type { Store } from '../store/store';
import { ApiError, createApi, type Api } from './rest';
import {
  createOfficeSocket,
  type OfficeSocket,
  type SocketTimers,
  type OfficeSocketOptions,
} from './socket';

export interface ConnectionDeps {
  store: Store<AppState>;
  api?: Api;
  wsUrl?: string;
  WebSocketImpl?: OfficeSocketOptions['WebSocketImpl'];
  timers?: SocketTimers;
}

export interface Connection {
  start(): void;
  retryNow(): void;
  stop(): void;
  setLanguage(lang: Lang): void;
  setSound(on: boolean): void;
  /** Recent activity of one NPC, newest first (rejects on network/HTTP errors). */
  npcHistory(key: string): Promise<ActivityItem[]>;
  /** Server counters (no content), for the "Desktop sessions not detected" hint. */
  diag(): Promise<Record<string, number>>;
}

function defaultWsUrl(): string {
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${location.host}/ws`;
}

const isAuthFailure = (error: unknown) =>
  error instanceof ApiError && (error.status === 401 || error.status === 403);

export function createConnection(deps: ConnectionDeps): Connection {
  const { store } = deps;
  const api = deps.api ?? createApi();
  const timers: SocketTimers = deps.timers ?? {
    setTimeout: (cb, ms) => window.setTimeout(cb, ms),
    clearTimeout: (id) => window.clearTimeout(id),
    setInterval: (cb, ms) => window.setInterval(cb, ms),
    clearInterval: (id) => window.clearInterval(id),
  };
  let countdownId: number | null = null;
  let socket: OfficeSocket | null = null;
  let bootTimer: number | null = null;
  let bootAttempt = 0;
  let stopped = false;

  const stopCountdown = () => {
    if (countdownId !== null) timers.clearInterval(countdownId);
    countdownId = null;
  };

  const startCountdown = (ms: number) => {
    stopCountdown();
    let left = Math.max(1, Math.ceil(ms / 1000));
    store.setState({ retryInSec: left });
    countdownId = timers.setInterval(() => {
      left = Math.max(0, left - 1);
      store.setState({ retryInSec: left });
    }, 1000);
  };

  /** Session check. Applies the server language only if the user has not picked one in this browser. */
  const checkSession = async (): Promise<boolean> => {
    try {
      const session = await api.getSession();
      if (!hasStoredLang()) store.setState({ lang: session.lang });
      return true;
    } catch (error) {
      if (isAuthFailure(error)) {
        stopCountdown();
        store.setState({ connection: 'unauthorized', retryInSec: null });
        return false;
      }
      throw error;
    }
  };

  const ensureSocket = (): OfficeSocket => {
    socket ??= createOfficeSocket({
      url: deps.wsUrl ?? defaultWsUrl(),
      WebSocketImpl: deps.WebSocketImpl,
      timers,
      beforeReconnect: checkSession,
      onMessages: (messages) => {
        store.setState((state) => {
          let next = state;
          for (const message of messages) next = applyServerMessage(next, message);
          return next;
        });
      },
      onStatus: (status) => {
        if (status.kind === 'open') {
          stopCountdown();
          store.setState({ connection: 'online', retryInSec: null });
        } else if (status.kind === 'closed') {
          store.setState({ connection: 'offline' });
          startCountdown(status.retryInMs);
        }
      },
    });
    return socket;
  };

  const boot = async () => {
    if (stopped) return;
    try {
      if (!(await checkSession())) return;
      bootAttempt = 0;
      ensureSocket().connect();
    } catch {
      // Server not reachable yet: same backoff as the socket.
      const wait = Math.min(30_000, 1_000 * 2 ** bootAttempt++);
      store.setState({ connection: 'offline' });
      startCountdown(wait);
      bootTimer = timers.setTimeout(() => {
        bootTimer = null;
        void boot();
      }, wait);
    }
  };

  return {
    start() {
      stopped = false;
      store.setState({ connection: 'loading' });
      void boot();
    },
    retryNow() {
      if (bootTimer !== null) {
        timers.clearTimeout(bootTimer);
        bootTimer = null;
        void boot();
      } else if (store.getState().connection === 'unauthorized') {
        store.setState({ connection: 'loading' });
        void boot();
      } else {
        socket?.retryNow();
      }
    },
    stop() {
      stopped = true;
      stopCountdown();
      if (bootTimer !== null) timers.clearTimeout(bootTimer);
      socket?.close();
    },
    setLanguage(lang) {
      store.setState({ lang });
      storeLang(lang);
      void api.patchConfig({ lang }).catch(() => undefined);
    },
    npcHistory: (key) => api.getNpcHistory(key),
    diag: () => api.getDiag(),
    setSound(on) {
      store.setState({ soundOn: on });
      void api.patchConfig({ sound: on }).catch(() => undefined);
    },
  };
}
