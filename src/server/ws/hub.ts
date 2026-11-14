import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { WebSocket } from '@fastify/websocket';
import {
  ClientMessageSchema,
  PROTOCOL_VERSION,
  type OfficeSnapshot,
  type ServerMessage,
} from '../../shared/contracts';
import '../http/auth/types';

export const BATCH_INTERVAL_MS = 100;
const MAX_CLIENTS = 20;
const MAX_CLIENT_FRAME_BYTES = 1024;
const MAX_CLIENT_MSGS_PER_SEC = 50;
const MAX_BUFFERED_BYTES = 4 * 1024 * 1024;
const MAX_PENDING_ITEMS = 5000;
const HEARTBEAT_MS = 30_000;

export interface HubOptions {
  serverVersion: string;
  /** Full state sent to every client right after it connects. */
  snapshot: () => OfficeSnapshot;
  now?: () => number;
  batchIntervalMs?: number;
}

interface Client {
  socket: WebSocket;
  sessionKey: string;
  alive: boolean;
  windowStart: number;
  windowCount: number;
}

/**
 * WebSocket hub for `/ws` (ARQUITETURA §5.4). Authentication (Host, exact Origin, session
 * cookie) already happened in the auth hook before the upgrade (403 otherwise). Server messages
 * are coalesced into one `{t:"batch"}` per <=100 ms; the browser may only send `{t:"ping"}`
 * (anything else is ignored). Idle cost is zero: the flush timer exists only while there is
 * something to send.
 */
export class WsHub {
  private readonly clients = new Set<Client>();
  private pending: ServerMessage[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private heartbeat: NodeJS.Timeout | null = null;
  private readonly now: () => number;
  private readonly interval: number;

  constructor(private readonly options: HubOptions) {
    this.now = options.now ?? Date.now;
    this.interval = options.batchIntervalMs ?? BATCH_INTERVAL_MS;
  }

  clientCount(): number {
    return this.clients.size;
  }

  /** Queues a message for every connected client (dropped when nobody listens). */
  broadcast(message: ServerMessage): void {
    if (this.clients.size === 0) return;
    this.pending.push(message);
    if (this.pending.length >= MAX_PENDING_ITEMS) {
      this.flush();
      return;
    }
    this.flushTimer ??= setTimeout(() => this.flush(), this.interval);
  }

  /** Sends everything queued now (also used on shutdown and by tests). */
  flush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.pending.length === 0) return;
    const payload = JSON.stringify({ t: 'batch', items: this.pending });
    this.pending = [];
    for (const client of this.clients) this.send(client, payload);
  }

  /** Closes the sockets of one browser session (logout). */
  closeSession(sessionKey: string): void {
    for (const client of [...this.clients]) {
      if (client.sessionKey !== sessionKey) continue;
      try {
        client.socket.close(4401, 'logged out');
      } catch {
        client.socket.terminate();
      }
    }
  }

  /** Closes every socket (session invalidated, shutdown). */
  closeAll(code: number, reason: string): void {
    for (const client of [...this.clients]) {
      try {
        client.socket.close(code, reason);
      } catch {
        client.socket.terminate();
      }
    }
  }

  close(): void {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.flushTimer = null;
    this.heartbeat = null;
    this.pending = [];
    this.closeAll(1001, 'server shutting down');
  }

  register(app: FastifyInstance): void {
    app.get('/ws', { websocket: true, config: { auth: 'ws' } }, (socket, request) =>
      this.accept(socket, request),
    );
  }

  private accept(socket: WebSocket, request: FastifyRequest): void {
    if (this.clients.size >= MAX_CLIENTS) {
      socket.close(1013, 'too many clients');
      return;
    }
    const client: Client = {
      socket,
      sessionKey: request.escSession?.key ?? '',
      alive: true,
      windowStart: this.now(),
      windowCount: 0,
    };
    this.clients.add(client);
    this.ensureHeartbeat();

    socket.on('pong', () => {
      client.alive = true;
    });
    socket.on('message', (data: unknown) => this.onClientMessage(client, data));
    socket.on('close', () => this.clients.delete(client));
    socket.on('error', () => {
      this.clients.delete(client);
      socket.terminate();
    });

    // Snapshot on every connection (the client reconnects with backoff and starts from here).
    const hello: ServerMessage = {
      t: 'hello',
      v: PROTOCOL_VERSION,
      serverVersion: this.options.serverVersion,
      now: this.now(),
    };
    const snapshot: ServerMessage = { t: 'snapshot', snapshot: this.options.snapshot() };
    this.send(client, JSON.stringify({ t: 'batch', items: [hello, snapshot] }));
  }

  private onClientMessage(client: Client, data: unknown): void {
    const t = this.now();
    if (t - client.windowStart >= 1000) {
      client.windowStart = t;
      client.windowCount = 0;
    }
    if (++client.windowCount > MAX_CLIENT_MSGS_PER_SEC) {
      client.socket.close(1008, 'rate limit');
      return;
    }
    let parsed: unknown;
    try {
      const text = Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
      if (text.length > MAX_CLIENT_FRAME_BYTES) return;
      parsed = JSON.parse(text);
    } catch {
      return; // ignored, never an error to the client
    }
    if (ClientMessageSchema.safeParse(parsed).success) {
      client.alive = true; // `{t:"ping"}` is a keep-alive; nothing else is accepted
    }
  }

  private send(client: Client, payload: string): void {
    const { socket } = client;
    if (socket.readyState !== socket.OPEN) return;
    if (socket.bufferedAmount > MAX_BUFFERED_BYTES) {
      socket.terminate(); // slow consumer: it reconnects and gets a fresh snapshot
      this.clients.delete(client);
      return;
    }
    socket.send(payload);
  }

  private ensureHeartbeat(): void {
    if (this.heartbeat) return;
    this.heartbeat = setInterval(() => {
      for (const client of this.clients) {
        if (!client.alive) {
          client.socket.terminate();
          this.clients.delete(client);
          continue;
        }
        client.alive = false;
        client.socket.ping();
      }
      if (this.clients.size === 0 && this.heartbeat) {
        clearInterval(this.heartbeat);
        this.heartbeat = null;
      }
    }, HEARTBEAT_MS);
    this.heartbeat.unref();
  }
}
