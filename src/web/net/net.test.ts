import { describe, expect, it } from 'vitest';
import { applyServerMessage, initialState, type AppState } from '../store/appState';
import { createStore } from '../store/store';
import { makeSnapshot } from '../store/fixtures';
import { createConnection } from './connection';
import { ApiError, createApi } from './rest';
import { backoffMs, createOfficeSocket, parseFrame, type SocketTimers } from './socket';

// --- Fakes ---------------------------------------------------------------------------------------

class FakeTimers implements SocketTimers {
  now = 0;
  private id = 1;
  private timeouts = new Map<number, { at: number; cb: () => void }>();
  private intervals = new Map<number, { every: number; next: number; cb: () => void }>();
  setTimeout = (cb: () => void, ms: number) => {
    const id = this.id++;
    this.timeouts.set(id, { at: this.now + ms, cb });
    return id;
  };
  clearTimeout = (id: number) => void this.timeouts.delete(id);
  setInterval = (cb: () => void, ms: number) => {
    const id = this.id++;
    this.intervals.set(id, { every: ms, next: this.now + ms, cb });
    return id;
  };
  clearInterval = (id: number) => void this.intervals.delete(id);
  async advance(ms: number) {
    const end = this.now + ms;
    for (;;) {
      let nextAt = Infinity;
      for (const t of this.timeouts.values()) nextAt = Math.min(nextAt, t.at);
      for (const i of this.intervals.values()) nextAt = Math.min(nextAt, i.next);
      if (nextAt > end) break;
      this.now = nextAt;
      for (const [id, t] of [...this.timeouts]) {
        if (t.at <= this.now) {
          this.timeouts.delete(id);
          t.cb();
        }
      }
      for (const i of this.intervals.values()) {
        if (i.next <= this.now) {
          i.next += i.every;
          i.cb();
        }
      }
      await Promise.resolve();
      await Promise.resolve();
    }
    this.now = end;
  }
}

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 3;
    this.onclose?.();
  }
  serverOpen() {
    this.readyState = 1;
    this.onopen?.();
  }
  serverSend(data: unknown) {
    this.onmessage?.({ data: typeof data === 'string' ? data : JSON.stringify(data) });
  }
  serverDrop() {
    this.readyState = 3;
    this.onclose?.();
  }
}

const WS = FakeWebSocket as unknown as typeof WebSocket;
const flush = async () => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
};

// --- Tests ---------------------------------------------------------------------------------------

describe('socket frames', () => {
  it('CA-12: reads batches and single messages tolerantly (invalid items are dropped)', () => {
    const batch = {
      t: 'batch',
      items: [
        { t: 'approval.remove', id: 'x' },
        { t: 'nonsense', foo: 1 },
        { t: 'approval.remove' }, // missing id
        { t: 'rooms', slots: [null, null, null, null], overflow: [] },
      ],
    };
    expect(parseFrame(JSON.stringify(batch)).map((m) => m.t)).toEqual(['approval.remove', 'rooms']);
    expect(parseFrame({ t: 'approval.remove', id: 'y' })).toHaveLength(1);
    expect(parseFrame('not json')).toEqual([]);
    expect(parseFrame(42)).toEqual([]);
    expect(parseFrame(null)).toEqual([]);
  });

  it('CA-17: reads npc.remove and rejects one without a key', () => {
    expect(parseFrame({ t: 'npc.remove', key: 'freelancer:x' })).toEqual([
      { t: 'npc.remove', key: 'freelancer:x' },
    ]);
    expect(parseFrame({ t: 'npc.remove' })).toEqual([]);
  });

  it('CA-12: tolerates unknown fields on known messages', () => {
    const msgs = parseFrame({ t: 'approval.remove', id: 'z', future: { a: 1 } });
    expect(msgs).toEqual([{ t: 'approval.remove', id: 'z' }]);
  });

  it('CA-12: backoff doubles from 1 s up to 30 s', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 20].map(backoffMs)).toEqual([
      1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000,
    ]);
  });
});

describe('office socket', () => {
  it('CA-12: reconnects with growing backoff, resets after a successful open, and pings', async () => {
    FakeWebSocket.instances = [];
    const timers = new FakeTimers();
    const statuses: string[] = [];
    const socket = createOfficeSocket({
      url: 'ws://x/ws',
      WebSocketImpl: WS,
      timers,
      onMessages: () => undefined,
      onStatus: (s) => statuses.push(s.kind === 'closed' ? `closed:${s.retryInMs}` : s.kind),
    });
    socket.connect();
    FakeWebSocket.instances[0]?.serverDrop(); // never opened
    await timers.advance(999);
    expect(FakeWebSocket.instances).toHaveLength(1);
    await timers.advance(2);
    expect(FakeWebSocket.instances).toHaveLength(2);
    FakeWebSocket.instances[1]?.serverDrop();
    await timers.advance(2001);
    expect(FakeWebSocket.instances).toHaveLength(3);

    FakeWebSocket.instances[2]?.serverOpen();
    await timers.advance(25_000);
    expect(FakeWebSocket.instances[2]?.sent).toEqual([JSON.stringify({ t: 'ping' })]);
    FakeWebSocket.instances[2]?.serverDrop();
    expect(statuses.at(-1)).toBe('closed:1000'); // backoff restarted after the successful open
    socket.close();
  });

  it('CA-12: stops reconnecting when beforeReconnect says the session is gone', async () => {
    FakeWebSocket.instances = [];
    const timers = new FakeTimers();
    const socket = createOfficeSocket({
      url: 'ws://x/ws',
      WebSocketImpl: WS,
      timers,
      beforeReconnect: async () => false,
      onMessages: () => undefined,
      onStatus: () => undefined,
    });
    socket.connect();
    FakeWebSocket.instances[0]?.serverDrop();
    await timers.advance(5_000);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it('CA-12: close() never reconnects', async () => {
    FakeWebSocket.instances = [];
    const timers = new FakeTimers();
    const socket = createOfficeSocket({
      url: 'ws://x',
      WebSocketImpl: WS,
      timers,
      onMessages: () => undefined,
      onStatus: () => undefined,
    });
    socket.connect();
    socket.close();
    await timers.advance(60_000);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });
});

describe('REST client', () => {
  const ok = (body: unknown) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });

  it('CA-30: actions carry the CSRF header from /api/session; reads do not', async () => {
    const calls: { path: string; init?: RequestInit }[] = [];
    const api = createApi(async (path, init) => {
      calls.push({ path, init });
      if (path === '/api/session') return ok({ csrfToken: 'c'.repeat(32), lang: 'en' });
      return ok({});
    });
    const session = await api.getSession();
    expect(session.lang).toBe('en');
    expect(
      (calls[0]?.init?.headers as Record<string, string>)['X-Escritorio-CSRF'],
    ).toBeUndefined();
    await api.patchConfig({ lang: 'en' });
    const headers = calls[1]?.init?.headers as Record<string, string>;
    expect(headers['X-Escritorio-CSRF']).toBe('c'.repeat(32));
    expect(calls[1]?.init?.method).toBe('PATCH');
    expect(calls[1]?.init?.body).toBe(JSON.stringify({ lang: 'en' }));
    expect(calls[1]?.init?.credentials).toBe('same-origin');
  });

  it('CA-30: refuses to send an action before it has a CSRF token', async () => {
    const api = createApi(async () => ok({}));
    await expect(api.patchConfig({ sound: true })).rejects.toBeInstanceOf(ApiError);
  });

  it('CA-31: never sends fields outside the closed config list', async () => {
    const api = createApi(async () => ok({ csrfToken: 'c'.repeat(32), lang: 'pt-BR' }));
    await api.getSession();
    // @ts-expect-error a path is not part of the closed list
    await expect(api.patchConfig({ cwd: 'C:\\x' })).rejects.toThrow();
    await expect(api.patchConfig({})).rejects.toThrow();
  });

  it('CA-03: a 401 becomes an ApiError with the status', async () => {
    const api = createApi(async () => new Response('', { status: 401 }));
    await expect(api.getSession()).rejects.toMatchObject({ status: 401 });
  });
});

describe('connection manager', () => {
  const sessionOk = { csrfToken: 'c'.repeat(32), lang: 'pt-BR' as const };

  it('CA-03: a 401 on the session shows the "open from the shortcut" state and never opens a socket', async () => {
    FakeWebSocket.instances = [];
    const store = createStore<AppState>(initialState());
    const conn = createConnection({
      store,
      timers: new FakeTimers(),
      WebSocketImpl: WS,
      wsUrl: 'ws://x/ws',
      api: {
        getSession: async () => {
          throw new ApiError(401, 'unauthorized');
        },
        patchConfig: async () => undefined,
        getNpcHistory: async () => [],
        getDiag: async () => ({}),
      },
    });
    conn.start();
    await flush();
    expect(store.getState().connection).toBe('unauthorized');
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it('CA-12: connects, applies the snapshot, shows offline with a countdown, and recovers with a new snapshot', async () => {
    FakeWebSocket.instances = [];
    const timers = new FakeTimers();
    const store = createStore<AppState>(initialState());
    const conn = createConnection({
      store,
      timers,
      WebSocketImpl: WS,
      wsUrl: 'ws://x/ws',
      api: { getSession: async () => sessionOk, patchConfig: async () => undefined },
    });
    conn.start();
    await flush();
    expect(store.getState().connection).toBe('loading');
    const ws1 = FakeWebSocket.instances[0] as FakeWebSocket;
    ws1.serverOpen();
    expect(store.getState().connection).toBe('online');
    ws1.serverSend({ t: 'batch', items: [{ t: 'snapshot', snapshot: makeSnapshot() }] });
    expect(store.getState().snapshot?.team.studio.name).toBe('Estúdio do Carlos');

    ws1.serverDrop();
    expect(store.getState().connection).toBe('offline');
    expect(store.getState().retryInSec).toBe(1);
    // The old snapshot stays visible while offline (no blank screen).
    expect(store.getState().snapshot).not.toBeNull();

    await timers.advance(1_100);
    await flush();
    const ws2 = FakeWebSocket.instances[1] as FakeWebSocket;
    expect(ws2).toBeDefined();
    ws2.serverOpen();
    expect(store.getState().connection).toBe('online');
    expect(store.getState().retryInSec).toBeNull();
    ws2.serverSend({
      t: 'snapshot',
      snapshot: makeSnapshot({ team: { ...makeSnapshot().team, studio: { name: 'Novo' } } }),
    });
    expect(store.getState().snapshot?.team.studio.name).toBe('Novo');
  });

  it('CA-12: when the server is not reachable at start it retries with backoff instead of failing', async () => {
    FakeWebSocket.instances = [];
    const timers = new FakeTimers();
    const store = createStore<AppState>(initialState());
    let attempts = 0;
    const conn = createConnection({
      store,
      timers,
      WebSocketImpl: WS,
      wsUrl: 'ws://x/ws',
      api: {
        getSession: async () => {
          attempts++;
          if (attempts < 3) throw new TypeError('network down');
          return sessionOk;
        },
        patchConfig: async () => undefined,
        getNpcHistory: async () => [],
        getDiag: async () => ({}),
      },
    });
    conn.start();
    await flush();
    expect(store.getState().connection).toBe('offline');
    await timers.advance(1_100);
    await flush();
    await timers.advance(2_100);
    await flush();
    expect(attempts).toBe(3);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it('CA-10: switching language updates the store at once and persists on the server (best effort)', async () => {
    const patches: unknown[] = [];
    const store = createStore<AppState>(initialState());
    const conn = createConnection({
      store,
      timers: new FakeTimers(),
      WebSocketImpl: WS,
      wsUrl: 'ws://x/ws',
      api: {
        getSession: async () => sessionOk,
        getNpcHistory: async () => [],
        getDiag: async () => ({}),
        patchConfig: async (p) => {
          patches.push(p);
          throw new Error('server down'); // must not surface
        },
      },
    });
    conn.setLanguage('en');
    expect(store.getState().lang).toBe('en');
    conn.setSound(true);
    expect(store.getState().soundOn).toBe(true);
    await flush();
    expect(patches).toEqual([{ lang: 'en' }, { sound: true }]);
  });
});

describe('reducer through the socket', () => {
  it('CA-12: applying a frame of several messages yields one consistent state', () => {
    const msgs = parseFrame({
      t: 'batch',
      items: [
        { t: 'snapshot', snapshot: makeSnapshot() },
        { t: 'rooms', slots: ['A', null, null, null], overflow: ['B'] },
      ],
    });
    let s = initialState();
    for (const m of msgs) s = applyServerMessage(s, m);
    expect(s.roomSlots[0]).toBe('A');
    expect(s.snapshot).not.toBeNull();
  });
});
