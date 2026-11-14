// WebSocket client for `/ws` (ARQUITETURA §5.4): reconnect with backoff 1 s -> 30 s, the server sends
// a full snapshot on every connection, messages arrive batched (<=100 ms) and are read TOLERANTLY:
// an invalid or unknown message is dropped, never thrown. The only thing sent is `{t:"ping"}`.

import { ServerMessageSchema } from '../../shared/contracts';
import type { IncomingMessage } from '../store/appState';

export const BACKOFF_START_MS = 1_000;
export const BACKOFF_MAX_MS = 30_000;
export const PING_EVERY_MS = 25_000;

/** 1 s, 2 s, 4 s ... capped at 30 s. `attempt` is 0 for the first retry. */
export function backoffMs(attempt: number): number {
  return Math.min(BACKOFF_MAX_MS, BACKOFF_START_MS * 2 ** Math.max(0, attempt));
}

/** Extracts the valid messages from one raw frame (single message or `{t:"batch", items}`). */
export function parseFrame(raw: unknown): IncomingMessage[] {
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (typeof value !== 'object' || value === null) return [];
  const candidate = value as { t?: unknown; items?: unknown };
  const items: unknown[] =
    candidate.t === 'batch' ? (Array.isArray(candidate.items) ? candidate.items : []) : [value];
  const out: IncomingMessage[] = [];
  for (const item of items) {
    const maybeRemove = item as { t?: unknown; key?: unknown };
    if (
      maybeRemove?.t === 'npc.remove' &&
      typeof maybeRemove.key === 'string' &&
      maybeRemove.key.length <= 160
    ) {
      out.push({ t: 'npc.remove', key: maybeRemove.key });
      continue;
    }
    const parsed = ServerMessageSchema.safeParse(item);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

export interface SocketTimers {
  setTimeout: (cb: () => void, ms: number) => number;
  clearTimeout: (id: number) => void;
  setInterval: (cb: () => void, ms: number) => number;
  clearInterval: (id: number) => void;
}

export type SocketStatus =
  { kind: 'connecting' } | { kind: 'open' } | { kind: 'closed'; retryInMs: number };

export interface OfficeSocketOptions {
  url: string;
  onMessages: (messages: IncomingMessage[]) => void;
  onStatus: (status: SocketStatus) => void;
  /** Called before each reconnect attempt; return false to stop (e.g. the session expired). */
  beforeReconnect?: () => Promise<boolean>;
  WebSocketImpl?: typeof WebSocket;
  timers?: SocketTimers;
}

export interface OfficeSocket {
  connect(): void;
  /** Reconnect immediately ("try now"). */
  retryNow(): void;
  close(): void;
}

const browserTimers: SocketTimers = {
  setTimeout: (cb, ms) => window.setTimeout(cb, ms),
  clearTimeout: (id) => window.clearTimeout(id),
  setInterval: (cb, ms) => window.setInterval(cb, ms),
  clearInterval: (id) => window.clearInterval(id),
};

export function createOfficeSocket(options: OfficeSocketOptions): OfficeSocket {
  const timers = options.timers ?? browserTimers;
  const Impl = options.WebSocketImpl ?? WebSocket;
  let socket: WebSocket | null = null;
  let retryTimer: number | null = null;
  let pingTimer: number | null = null;
  let attempt = 0;
  let closedByUs = false;

  const clearTimers = () => {
    if (retryTimer !== null) timers.clearTimeout(retryTimer);
    if (pingTimer !== null) timers.clearInterval(pingTimer);
    retryTimer = null;
    pingTimer = null;
  };

  const open = () => {
    clearTimers();
    options.onStatus({ kind: 'connecting' });
    let ws: WebSocket;
    try {
      ws = new Impl(options.url);
    } catch {
      scheduleRetry();
      return;
    }
    socket = ws;
    ws.onopen = () => {
      attempt = 0;
      options.onStatus({ kind: 'open' });
      pingTimer = timers.setInterval(() => {
        if (ws.readyState === 1) ws.send(JSON.stringify({ t: 'ping' }));
      }, PING_EVERY_MS);
    };
    ws.onmessage = (event: MessageEvent) => {
      const messages = parseFrame(event.data);
      if (messages.length > 0) options.onMessages(messages);
    };
    ws.onclose = () => {
      if (socket === ws) socket = null;
      if (!closedByUs) scheduleRetry();
    };
    ws.onerror = () => {
      // `onclose` always follows; reconnect is scheduled there.
    };
  };

  const scheduleRetry = () => {
    clearTimers();
    const wait = backoffMs(attempt++);
    options.onStatus({ kind: 'closed', retryInMs: wait });
    retryTimer = timers.setTimeout(() => {
      retryTimer = null;
      void reconnect();
    }, wait);
  };

  const reconnect = async () => {
    if (closedByUs) return;
    if (options.beforeReconnect) {
      // If the check itself fails (server down) keep trying; only a definite "no" stops.
      const ok = await options.beforeReconnect().catch(() => true);
      if (!ok) return;
    }
    if (!closedByUs) open();
  };

  return {
    connect() {
      closedByUs = false;
      open();
    },
    retryNow() {
      if (closedByUs || socket) return;
      attempt = 0;
      clearTimers();
      void reconnect();
    },
    close() {
      closedByUs = true;
      clearTimers();
      const ws = socket;
      socket = null;
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
    },
  };
}
