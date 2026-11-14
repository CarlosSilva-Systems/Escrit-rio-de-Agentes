import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkHealth, requestShutdown, requestTicket, verifyServer } from '../../src/cli/client';
import { resolveHomePaths } from '../../src/server/home/paths';
import { proofOf, TokenStore } from '../../src/server/home/tokens';
import {
  SESSION_MAX_AGE_MS,
  SESSION_TTL_MS,
  SessionStore,
} from '../../src/server/http/auth/sessions';
import { login, rawRequest, readMaster, startTestServer, type TestServer } from './helpers/server';

describe('identity proof (M2)', () => {
  let server: TestServer;
  beforeAll(async () => {
    server = await startTestServer();
  });
  afterAll(() => server.stop());

  const nonce = 'n'.repeat(24);

  it('CA-03: /api/health/proof is public and answers HMAC(token, nonce) for master and hook', async () => {
    const master = await readMaster(server);
    const m = await rawRequest(server.port, { path: `/api/health/proof?n=${nonce}` });
    expect(JSON.parse(m.body)).toEqual({ proof: proofOf(master, nonce) });
    const hook = (
      await import('node:fs/promises').then((f) =>
        f.readFile(join(server.home, 'hook-token'), 'utf8'),
      )
    ).trim();
    const h = await rawRequest(server.port, { path: `/api/health/proof?n=${nonce}&k=hook` });
    expect(JSON.parse(h.body)).toEqual({ proof: proofOf(hook, nonce) });
    expect(proofOf(master, nonce)).not.toBe(proofOf(hook, nonce));
  });

  it('CA-03: bad nonces and extra parameters are 400', async () => {
    for (const q of [
      '',
      '?n=short',
      `?n=${nonce}&x=1`,
      `?n=${nonce}&k=other`,
      `?n=${'%3Cx%3E'.repeat(8)}`,
    ]) {
      const r = await rawRequest(server.port, { path: `/api/health/proof${q}` });
      expect(r.status, q).toBe(400);
    }
  });

  it('CA-03: the CLI client verifies the server before sending the token and works against the real one', async () => {
    const master = await readMaster(server);
    expect(await verifyServer(server.port, master)).toBe(true);
    expect(await checkHealth(server.port, master)).toMatchObject({ version: expect.any(String) });
    expect(await requestTicket(server.port, master)).toMatchObject({ ok: true });
    expect(await verifyServer(server.port, 'W'.repeat(43))).toBe(false);
  });

  it('CA-03: against an impostor on the port the CLI sends NO credential (health, ticket, shutdown)', async () => {
    const seen: Array<{ url?: string; auth?: string }> = [];
    const squatter = createServer((req, res) => {
      seen.push({ url: req.url, auth: req.headers.authorization });
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          proof: 'b'.repeat(64),
          ok: true,
          version: '9',
          ticket: 'x'.repeat(32),
          expiresInSec: 60,
        }),
      );
    });
    await new Promise<void>((r) => squatter.listen(0, '127.0.0.1', r));
    const port = (squatter.address() as { port: number }).port;
    const token = 'T'.repeat(43);
    expect(await checkHealth(port, token)).toBeNull();
    expect(await requestTicket(port, token)).toEqual({ ok: false, status: 0 });
    expect(await requestShutdown(port, token)).toBe(false);
    await new Promise((r) => squatter.close(r));
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((s) => s.auth === undefined && s.url?.startsWith('/api/health/proof'))).toBe(
      true,
    );
  });
});

describe('rate limit and headers on normalized paths (B1, B2)', () => {
  let server: TestServer;
  beforeAll(async () => {
    server = await startTestServer({ limits: { auth: 2 } });
  });
  afterAll(() => server.stop());

  it('CA-03: /%61uth/callback is limited exactly like /auth/callback', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) {
      statuses.push(
        (await rawRequest(server.port, { path: '/%61uth/callback?ticket=bad' })).status,
      );
    }
    expect(statuses.slice(0, 2)).toEqual([401, 401]);
    expect(statuses.slice(2)).toEqual([429, 429]);
  });

  it('CA-03: an encoded API path still gets Cache-Control: no-store', async () => {
    const r = await rawRequest(server.port, { path: '/%61pi/session' });
    expect(r.status).toBe(401);
    expect(r.headers['cache-control']).toBe('no-store');
  });
});

describe('rate-limit buckets are per session, not per address (B2)', () => {
  let server: TestServer;
  beforeAll(async () => {
    server = await startTestServer({ limits: { general: 5 } });
  });
  afterAll(() => server.stop());

  it('CA-03: each session has its own bucket and cookie-less probes never spend it', async () => {
    const one = await login(server);
    const two = await login(server);
    const get = (cookie?: string) =>
      rawRequest(server.port, {
        path: '/api/session',
        ...(cookie ? { headers: { cookie } } : {}),
      });
    // Probes without a session (401, anonymous bucket).
    for (let i = 0; i < 10; i++) expect((await get()).status).toBe(401);
    // Session one uses its own budget (login already spent 1: /api/session) ...
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await get(one.cookie)).status);
    expect(statuses).toContain(429);
    // ... without touching session two's budget.
    expect((await get(two.cookie)).status).toBe(200);
  });
});

describe('logout and absolute session ceiling (B3)', () => {
  it('CA-03: POST /api/auth/logout ends the session (cookie dead, CSRF and Origin required)', async () => {
    const server = await startTestServer();
    try {
      const s = await login(server);
      const noCsrf = await rawRequest(server.port, {
        method: 'POST',
        path: '/api/auth/logout',
        headers: { cookie: s.cookie, origin: s.origin },
      });
      expect(noCsrf.status).toBe(403);
      const out = await rawRequest(server.port, {
        method: 'POST',
        path: '/api/auth/logout',
        headers: { cookie: s.cookie, origin: s.origin, 'x-escritorio-csrf': s.csrf },
      });
      expect(out.status).toBe(204);
      expect(String(out.headers['set-cookie'])).toMatch(/esc_sid=;/);
      const after = await rawRequest(server.port, {
        path: '/api/session',
        headers: { cookie: s.cookie },
      });
      expect(after.status).toBe(401);
    } finally {
      await server.stop();
    }
  });

  it('CA-03: a session dies at 24 h even when it is used continuously (sliding stays inside the cap)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sess-'));
    try {
      const paths = resolveHomePaths(dir);
      const tokens = await TokenStore.load(paths);
      let now = 1_000_000_000_000;
      const store = new SessionStore(paths, tokens, () => now);
      const { id } = store.create();
      // Used every hour: the idle window keeps sliding...
      for (let h = 1; h <= 23; h++) {
        now += 60 * 60 * 1000;
        expect(store.lookup(id), `hour ${h}`).not.toBeNull();
      }
      // ...but the absolute ceiling wins.
      now += 60 * 60 * 1000 + 1;
      expect(store.lookup(id)).toBeNull();
      expect(SESSION_MAX_AGE_MS).toBe(24 * 60 * 60 * 1000);
      expect(SESSION_TTL_MS).toBeLessThan(SESSION_MAX_AGE_MS);
      // Idle expiry: unused for longer than the idle window.
      const second = store.create();
      now += SESSION_TTL_MS + 1;
      expect(store.lookup(second.id)).toBeNull();
      expect(store.peekKey(second.id)).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
