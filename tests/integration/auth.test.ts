import { createHash } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { startServer } from '../../src/server/app';
import { resolveHomePaths, rotateTokenFiles } from '../../src/server/home';
import { TicketStore } from '../../src/server/http/auth';
import { login, rawRequest, readMaster, startTestServer, type TestServer } from './helpers/server';

/** Test-only routes: a state-changing session route and a hook-token route. */
const testRoutes: Parameters<typeof startTestServer>[0] = {
  extraRoutes: ({ app }) => {
    app.post('/api/_test/action', async () => ({ done: true }));
    app.post(
      '/api/hooks/v1/_test',
      { config: { auth: 'hook' }, bodyLimit: 1024 * 1024 },
      async () => ({
        hook: true,
      }),
    );
  },
};

const readLogs = async (server: TestServer) => {
  const dir = join(server.home, 'logs');
  const files = (await readdir(dir)).filter((f) => f.startsWith('escritorio-'));
  return (await Promise.all(files.map((f) => readFile(join(dir, f), 'utf8')))).join('\n');
};

describe('authentication (T-13)', () => {
  let server: TestServer;
  beforeAll(async () => {
    server = await startTestServer({ ...testRoutes, limits: { auth: 1000, actions: 1000 } });
  });
  afterAll(() => server.stop());
  afterEach(() => vi.useRealTimers());

  const issueTicket = async (token?: string) => {
    const bearer = token ?? (await readMaster(server));
    const res = await rawRequest(server.port, {
      method: 'POST',
      path: '/api/auth/ticket',
      headers: { authorization: `Bearer ${bearer}` },
    });
    return { res, ticket: res.status === 200 ? (JSON.parse(res.body).ticket as string) : '' };
  };

  it('CA-03: tokens are 256-bit, distinct, and unauthenticated requests get 401 with no data', async () => {
    const master = await readMaster(server);
    const hook = (await readFile(join(server.home, 'hook-token'), 'utf8')).trim();
    expect(Buffer.from(master, 'base64url')).toHaveLength(32);
    expect(Buffer.from(hook, 'base64url')).toHaveLength(32);
    expect(master).not.toBe(hook);

    for (const path of ['/api/session', '/api/state', '/api/diag', '/api/config']) {
      const res = await rawRequest(server.port, { path });
      expect(res.status, path).toBe(401);
      expect(JSON.parse(res.body)).toEqual({
        error: { code: 'unauthorized', message: 'Não autorizado.' },
      });
    }
    const bogus = await rawRequest(server.port, {
      path: '/api/session',
      headers: { cookie: 'esc_sid=' + 'A'.repeat(43) },
    });
    expect(bogus.status).toBe(401);
  });

  it('CA-03: POST /api/auth/ticket requires the master Bearer and refuses an Origin', async () => {
    const noAuth = await rawRequest(server.port, { method: 'POST', path: '/api/auth/ticket' });
    expect(noAuth.status).toBe(401);
    const hookToken = (await readFile(join(server.home, 'hook-token'), 'utf8')).trim();
    expect((await issueTicket(hookToken)).res.status).toBe(401); // hook token is not the master
    const withOrigin = await rawRequest(server.port, {
      method: 'POST',
      path: '/api/auth/ticket',
      headers: {
        authorization: `Bearer ${await readMaster(server)}`,
        origin: `http://127.0.0.1:${server.port}`,
      },
    });
    expect(withOrigin.status).toBe(403);

    const { res } = await issueTicket();
    const body = JSON.parse(res.body);
    expect(res.status).toBe(200);
    expect(body.expiresInSec).toBe(60);
    expect(Buffer.from(body.ticket, 'base64url').length).toBe(16); // 128 bits
  });

  it('CA-03: ticket -> cookie (HttpOnly, SameSite=Strict, Path=/), 303 to "/", nothing in the URL', async () => {
    const { ticket } = await issueTicket();
    const cb = await rawRequest(server.port, { path: `/auth/callback?ticket=${ticket}` });
    expect(cb.status).toBe(303);
    expect(cb.headers.location).toBe('/');
    const cookie = cb.headers['set-cookie']?.[0] ?? '';
    expect(cookie).toMatch(/^esc_sid=[A-Za-z0-9_-]{43};/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Path=\//);
    // 8 h sliding idle window (SESSION_TTL_MS); the 24 h absolute cap is enforced server-side (B3)
    expect(cookie).toMatch(/Max-Age=28800(;|$)/);
    expect(cookie).not.toMatch(/Secure/i); // plain http on loopback
    expect(cookie).not.toContain(ticket);
    expect(cb.headers['cache-control']).toBe('no-store');

    const session = await rawRequest(server.port, {
      path: '/api/session',
      headers: { cookie: cookie.split(';')[0]! },
    });
    expect(session.status).toBe(200);
    expect(JSON.parse(session.body)).toMatchObject({
      lang: 'pt-BR',
      csrfToken: expect.any(String),
    });
  });

  it('CA-03: a ticket is single use (reuse -> 401) and the 401 page sets no cookie', async () => {
    const { ticket } = await issueTicket();
    expect(
      (await rawRequest(server.port, { path: `/auth/callback?ticket=${ticket}` })).status,
    ).toBe(303);
    const again = await rawRequest(server.port, { path: `/auth/callback?ticket=${ticket}` });
    expect(again.status).toBe(401);
    expect(again.headers['set-cookie']).toBeUndefined();
    expect(again.headers['content-type']).toContain('text/html');
  });

  it('CA-03: a ticket expires after 60 s (401) and malformed callbacks get 401', async () => {
    const { ticket } = await issueTicket();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 61_000);
    const late = await rawRequest(server.port, { path: `/auth/callback?ticket=${ticket}` });
    expect(late.status).toBe(401);
    vi.useRealTimers();

    for (const path of [
      '/auth/callback',
      '/auth/callback?ticket=',
      '/auth/callback?ticket=short',
      '/auth/callback?ticket=' + 'x'.repeat(40),
    ]) {
      expect((await rawRequest(server.port, { path })).status, path).toBe(401);
    }
    // Extra query parameters are not tolerated on this action-like route.
    const { ticket: t2 } = await issueTicket();
    expect(
      (await rawRequest(server.port, { path: `/auth/callback?ticket=${t2}&x=1` })).status,
    ).toBe(401);
  });

  it('TicketStore: expiry and single use with an injected clock', () => {
    let now = 1_000_000;
    const store = new TicketStore(() => now);
    const a = store.issue();
    now += 59_999;
    expect(store.consume(a.ticket)).toBe(true);
    expect(store.consume(a.ticket)).toBe(false);
    const b = store.issue();
    now += 60_001;
    expect(store.consume(b.ticket)).toBe(false);
  });

  it('CA-30: actions need session + exact Origin + CSRF; everything else is 403/401', async () => {
    const s = await login(server);
    const call = (headers: Record<string, string>) =>
      rawRequest(server.port, { method: 'POST', path: '/api/_test/action', headers });

    expect((await call({})).status).toBe(401); // no cookie
    expect((await call({ cookie: s.cookie })).status).toBe(403); // no Origin
    expect((await call({ cookie: s.cookie, origin: s.origin })).status).toBe(403); // no CSRF
    expect(
      (await call({ cookie: s.cookie, origin: s.origin, 'x-escritorio-csrf': 'wrong' })).status,
    ).toBe(403);
    expect(
      (
        await call({
          cookie: s.cookie,
          origin: 'http://evil.example.com',
          'x-escritorio-csrf': s.csrf,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await call({
          cookie: s.cookie,
          origin: `http://127.0.0.1:${server.port + 1}`,
          'x-escritorio-csrf': s.csrf,
        })
      ).status,
    ).toBe(403);
    expect(
      (await call({ cookie: s.cookie, origin: 'null', 'x-escritorio-csrf': s.csrf })).status,
    ).toBe(403);

    const ok = await call({ cookie: s.cookie, origin: s.origin, 'x-escritorio-csrf': s.csrf });
    expect(ok.status).toBe(200);
    const okLocalhost = await call({
      cookie: s.cookie,
      origin: `http://localhost:${server.port}`,
      'x-escritorio-csrf': s.csrf,
      host: `localhost:${server.port}`,
    });
    expect(okLocalhost.status).toBe(200);

    // A CSRF token of another session does not work.
    const other = await login(server);
    expect(other.csrf).not.toBe(s.csrf);
    expect(
      (await call({ cookie: s.cookie, origin: s.origin, 'x-escritorio-csrf': other.csrf })).status,
    ).toBe(403);
  });

  it('CA-30: a foreign Origin on a GET with a valid cookie is refused too', async () => {
    const s = await login(server);
    const res = await rawRequest(server.port, {
      path: '/api/session',
      headers: { cookie: s.cookie, origin: 'http://evil.example.com' },
    });
    expect(res.status).toBe(403);
  });

  it('hook routes use the hook token (not the master), no Origin, no cookie needed', async () => {
    const hook = (await readFile(join(server.home, 'hook-token'), 'utf8')).trim();
    const master = await readMaster(server);
    const call = (headers: Record<string, string>) =>
      rawRequest(server.port, { method: 'POST', path: '/api/hooks/v1/_test', headers });
    expect((await call({ authorization: `Bearer ${hook}` })).status).toBe(200);
    expect((await call({ authorization: `Bearer ${master}` })).status).toBe(401);
    expect((await call({})).status).toBe(401);
    expect(
      (await call({ authorization: `Bearer ${hook}`, origin: `http://127.0.0.1:${server.port}` }))
        .status,
    ).toBe(403);
  });

  it('persists only SHA-256 digests of session ids, never the id or the CSRF token', async () => {
    const s = await login(server);
    await server.ctx.sessions.flush();
    const file = await readFile(join(server.home, 'sessions.json'), 'utf8');
    const id = s.cookie.split('=')[1]!;
    expect(file).not.toContain(id);
    expect(file).not.toContain(s.csrf);
    expect(file).toContain(createHash('sha256').update(id).digest('hex'));
  });

  it('CA-03: tokens, tickets, cookies and CSRF never appear in the logs', async () => {
    const master = await readMaster(server);
    const hook = (await readFile(join(server.home, 'hook-token'), 'utf8')).trim();
    const { ticket } = await issueTicket();
    const cb = await rawRequest(server.port, { path: `/auth/callback?ticket=${ticket}` });
    const cookie = cb.headers['set-cookie']?.[0]?.split(';')[0] ?? '';
    const sid = cookie.split('=')[1]!;
    const csrf = JSON.parse(
      (await rawRequest(server.port, { path: '/api/session', headers: { cookie } })).body,
    ).csrfToken;
    // Deliberately ugly traffic: bad bearer, bad ticket in the query, bad cookie.
    await rawRequest(server.port, {
      path: '/api/health',
      headers: { authorization: 'Bearer ' + 'Z'.repeat(43) },
    });
    await rawRequest(server.port, { path: '/auth/callback?ticket=' + 'Q'.repeat(22) });
    await rawRequest(server.port, {
      path: '/api/session',
      headers: { cookie: 'esc_sid=' + 'Y'.repeat(43) },
    });

    const logs = await readLogs(server);
    expect(logs.length).toBeGreaterThan(100);
    for (const secret of [
      master,
      hook,
      ticket,
      sid,
      csrf,
      'Z'.repeat(43),
      'Q'.repeat(22),
      'Y'.repeat(43),
    ]) {
      expect(logs.includes(secret), `log must not contain a secret (${secret.slice(0, 4)}…)`).toBe(
        false,
      );
    }
    expect(logs).not.toMatch(/ticket=/);
    expect(logs).toContain('"reason":"bad-ticket"');
  });
});

describe('rate limits (T-13)', () => {
  it('CA-03: /auth/callback and /api/auth/ticket allow 10 requests per minute, then 429', async () => {
    const server = await startTestServer();
    try {
      const statuses: number[] = [];
      for (let i = 0; i < 12; i++) {
        statuses.push(
          (await rawRequest(server.port, { path: '/auth/callback?ticket=nope' + 'x'.repeat(20) }))
            .status,
        );
      }
      expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
      expect(statuses.slice(10)).toEqual([429, 429]);
      const limited = await rawRequest(server.port, { path: '/auth/callback?ticket=zzzz' });
      expect(JSON.parse(limited.body).error.code).toBe('rate_limited');
    } finally {
      await server.stop();
    }
  });

  it('actions are limited per session (429) after the configured number per minute', async () => {
    const server = await startTestServer({ ...testRoutes, limits: { actions: 3, auth: 1000 } });
    try {
      const s = await login(server);
      const statuses: number[] = [];
      for (let i = 0; i < 5; i++) {
        statuses.push(
          (
            await rawRequest(server.port, {
              method: 'POST',
              path: '/api/_test/action',
              headers: { cookie: s.cookie, origin: s.origin, 'x-escritorio-csrf': s.csrf },
            })
          ).status,
        );
      }
      expect(statuses).toEqual([200, 200, 200, 429, 429]);
    } finally {
      await server.stop();
    }
  });
});

describe('sessions across restarts and token rotation (T-11/T-13)', () => {
  it('a session survives a restart with the same home, and token:rotate invalidates it', async () => {
    const home = await mkdtemp(join(tmpdir(), 'escritorio-test-'));
    const boot = () =>
      startServer({
        webRoot: null,
        env: {
          port: 0,
          paths: resolveHomePaths(home),
          devRoot: home,
          logLevel: 'error',
          claudeBin: undefined,
        },
      });
    try {
      let ctx = await boot();
      let server: TestServer = { ctx, port: ctx.net.port, home, stop: async () => undefined };
      const s = await login(server);
      await ctx.app.close(); // flushes sessions.json

      ctx = await boot();
      server = { ctx, port: ctx.net.port, home, stop: async () => undefined };
      const still = await rawRequest(server.port, {
        path: '/api/session',
        headers: { cookie: s.cookie },
      });
      expect(still.status).toBe(200);
      expect(JSON.parse(still.body).csrfToken).toBe(s.csrf); // stateless HMAC: stable across restarts

      // `escritorio token:rotate` runs in another process: the running server notices the change.
      await rotateTokenFiles(resolveHomePaths(home));
      let status = 200;
      for (let i = 0; i < 20 && status === 200; i++) {
        await new Promise((r) => setTimeout(r, 150));
        status = (
          await rawRequest(server.port, { path: '/api/session', headers: { cookie: s.cookie } })
        ).status;
      }
      expect(status).toBe(401);

      // A new login works with the new token.
      const fresh = await login(server);
      expect(fresh.cookie).not.toBe(s.cookie);
      await ctx.app.close();

      // Rotation while the server was down also invalidates persisted sessions (generation).
      await rotateTokenFiles(resolveHomePaths(home));
      ctx = await boot();
      const after = await rawRequest(ctx.net.port, {
        path: '/api/session',
        headers: { cookie: fresh.cookie },
      });
      expect(after.status).toBe(401);
      await ctx.app.close();
    } finally {
      await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
  });
});
