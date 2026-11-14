import { request as httpRequest } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ServerEnvelopeSchema, type ServerMessage } from '../../src/shared/contracts';
import { rotateTokenFiles, resolveHomePaths } from '../../src/server/home';
import { login, startTestServer, type LoggedInSession, type TestServer } from './helpers/server';

/** Raw upgrade request: resolves with the HTTP status the server answered (101 = upgraded). */
function upgrade(
  port: number,
  headers: Record<string, string>,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({
      host: '127.0.0.1',
      port,
      path: '/ws',
      agent: false, // a fresh connection per upgrade attempt (no keep-alive reuse)
      headers: {
        host: `127.0.0.1:${port}`,
        connection: 'Upgrade',
        upgrade: 'websocket',
        'sec-websocket-version': '13',
        'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
        ...headers,
      },
    });
    req.on('response', (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () =>
        resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }),
      );
    });
    req.on('upgrade', (res, socket) => {
      socket.destroy();
      resolve({ status: res.statusCode ?? 0, body: '' });
    });
    req.on('error', reject);
    req.end();
  });
}

type WsCtor = new (url: string, init?: { headers?: Record<string, string> }) => WebSocket;

function connect(server: TestServer, session: LoggedInSession) {
  const Ctor = WebSocket as unknown as WsCtor;
  const socket = new Ctor(`ws://127.0.0.1:${server.port}/ws`, {
    headers: { Origin: session.origin, Cookie: session.cookie },
  });
  const frames: unknown[] = [];
  let closeCode: number | undefined;
  socket.addEventListener('message', (event) => frames.push(JSON.parse(String(event.data))));
  socket.addEventListener('close', (event) => {
    closeCode = event.code;
  });
  const waitFor = async (predicate: () => boolean, ms = 3000) => {
    const end = Date.now() + ms;
    while (!predicate()) {
      if (Date.now() > end) throw new Error('timeout waiting for websocket condition');
      await new Promise((r) => setTimeout(r, 10));
    }
  };
  return { socket, frames, waitFor, closeCode: () => closeCode };
}

const flatten = (frames: unknown[]): ServerMessage[] =>
  frames.flatMap((f) => {
    const parsed = ServerEnvelopeSchema.parse(f);
    return parsed.t === 'batch' ? parsed.items : [parsed];
  });

describe('WebSocket hub /ws (T-14)', () => {
  let server: TestServer;
  let session: LoggedInSession;

  beforeAll(async () => {
    server = await startTestServer();
    session = await login(server);
  });
  afterAll(() => server.stop());

  it('CA-30: upgrade without Origin is refused with 403 (even with a valid cookie)', async () => {
    const res = await upgrade(server.port, { cookie: session.cookie });
    expect(res.status).toBe(403);
    expect(server.ctx.hub.clientCount()).toBe(0);
  });

  it('CA-03: upgrade with a valid Origin but no cookie, or a bad cookie, is refused with 403', async () => {
    expect((await upgrade(server.port, { origin: session.origin })).status).toBe(403);
    const bad = await upgrade(server.port, {
      origin: session.origin,
      cookie: 'esc_sid=' + 'A'.repeat(43),
    });
    expect(bad.status).toBe(403);
  });

  it('CA-30: foreign Origin, foreign Host and other ports are refused with 403', async () => {
    for (const origin of [
      'http://evil.example.com',
      `http://127.0.0.1:${server.port + 1}`,
      'null',
      `https://127.0.0.1:${server.port}`,
    ]) {
      expect((await upgrade(server.port, { origin, cookie: session.cookie })).status, origin).toBe(
        403,
      );
    }
    const host = await upgrade(server.port, {
      origin: session.origin,
      cookie: session.cookie,
      host: 'evil.example.com',
    });
    expect(host.status).toBe(403);
    expect(server.ctx.hub.clientCount()).toBe(0);
  });

  it('accepts a valid upgrade, answers 101 and sends hello + a valid snapshot on connect', async () => {
    const ok = await upgrade(server.port, { origin: session.origin, cookie: session.cookie });
    expect(ok.status).toBe(101);

    const client = connect(server, session);
    await client.waitFor(() => client.frames.length >= 1);
    const messages = flatten(client.frames);
    expect(messages.map((m) => m.t)).toEqual(['hello', 'snapshot']);
    const hello = messages[0]!;
    expect(hello).toMatchObject({ t: 'hello', v: 1 });
    const snapshot = messages[1]!;
    expect(snapshot.t === 'snapshot' && snapshot.snapshot.config.lang).toBe('pt-BR');
    expect(server.ctx.hub.clientCount()).toBe(1);
    client.socket.close();
    await client.waitFor(() => server.ctx.hub.clientCount() === 0);
  });

  it('batches broadcasts: several messages within 100 ms arrive in a single batch frame', async () => {
    const client = connect(server, session);
    await client.waitFor(() => client.frames.length >= 1);
    client.frames.length = 0;

    server.ctx.hub.broadcast({ t: 'approval.remove', id: 'a1' });
    server.ctx.hub.broadcast({ t: 'approval.remove', id: 'a2' });
    server.ctx.hub.broadcast({ t: 'approval.remove', id: 'a3' });
    const sentAt = Date.now();
    await client.waitFor(() => client.frames.length >= 1);
    expect(Date.now() - sentAt).toBeLessThan(500);
    await new Promise((r) => setTimeout(r, 200));

    expect(client.frames).toHaveLength(1);
    expect(client.frames[0]).toMatchObject({ t: 'batch' });
    expect(flatten(client.frames)).toEqual([
      { t: 'approval.remove', id: 'a1' },
      { t: 'approval.remove', id: 'a2' },
      { t: 'approval.remove', id: 'a3' },
    ]);
    client.socket.close();
    await client.waitFor(() => server.ctx.hub.clientCount() === 0);
  });

  it('a late client gets a fresh snapshot (not the backlog), and idle hubs keep no timer', async () => {
    const first = connect(server, session);
    await first.waitFor(() => first.frames.length >= 1);
    server.ctx.hub.broadcast({ t: 'approval.remove', id: 'old' });
    await first.waitFor(() => first.frames.length >= 2);

    const late = connect(server, session);
    await late.waitFor(() => late.frames.length >= 1);
    expect(flatten(late.frames).map((m) => m.t)).toEqual(['hello', 'snapshot']);
    first.socket.close();
    late.socket.close();
    await late.waitFor(() => server.ctx.hub.clientCount() === 0);
    // With nobody connected a broadcast is dropped (nothing queued, no timer).
    server.ctx.hub.broadcast({ t: 'approval.remove', id: 'nobody' });
    expect(server.ctx.hub.clientCount()).toBe(0);
  });

  it('ignores anything but {t:"ping"}: garbage and unknown messages do not break the connection', async () => {
    const client = connect(server, session);
    await client.waitFor(() => client.frames.length >= 1);
    client.frames.length = 0;
    client.socket.send('{not json');
    client.socket.send(JSON.stringify({ t: 'snapshot', evil: true }));
    client.socket.send(JSON.stringify({ t: 'ping' }));
    client.socket.send(JSON.stringify({ t: 'ping', extra: 1 }));
    await new Promise((r) => setTimeout(r, 150));
    expect(client.socket.readyState).toBe(WebSocket.OPEN);
    expect(client.frames).toEqual([]); // the server never answers client frames

    server.ctx.hub.broadcast({ t: 'approval.remove', id: 'still-alive' });
    await client.waitFor(() => client.frames.length >= 1);
    client.socket.close();
    await client.waitFor(() => server.ctx.hub.clientCount() === 0);
  });

  it('closes a client that sends an oversized frame (>1 kB)', async () => {
    const client = connect(server, session);
    await client.waitFor(() => client.frames.length >= 1);
    client.socket.send('x'.repeat(4096));
    await client.waitFor(() => client.closeCode() !== undefined);
    expect(client.closeCode()).toBe(1009);
    await client.waitFor(() => server.ctx.hub.clientCount() === 0);
  });

  it('closes open sockets when the tokens are rotated (session invalidated)', async () => {
    const own = await startTestServer();
    try {
      const s = await login(own);
      const client = connect(own, s);
      await client.waitFor(() => client.frames.length >= 1);
      await rotateTokenFiles(resolveHomePaths(own.home));
      // The server notices the new token on its next request (throttled to 1/s).
      await new Promise((r) => setTimeout(r, 1100));
      await fetch(`http://127.0.0.1:${own.port}/api/health`).catch(() => undefined);
      await client.waitFor(() => client.closeCode() !== undefined, 4000);
      expect(client.closeCode()).toBe(4401);
    } finally {
      await own.stop();
    }
  });
});
