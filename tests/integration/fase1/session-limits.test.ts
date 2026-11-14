import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ensureHome, resolveHomePaths, TokenStore } from '../../../src/server/home';
import {
  SESSION_MAX_AGE_MS,
  SESSION_TTL_MS,
  SessionStore,
} from '../../../src/server/http/auth/sessions';
import { login, rawRequest, startTestServer, type TestServer } from '../helpers/server';

// T-33 final round: session lifetime (8 h idle, 24 h absolute), driven by an injected clock, and the
// cookie / logout behaviour of the real server.

const H = 60 * 60 * 1000;
let dir: string;
let tokens: TokenStore;
let now = 1_000_000_000_000;
let sessions: SessionStore;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'session-limits-'));
  const paths = resolveHomePaths(dir);
  await ensureHome(paths);
  tokens = await TokenStore.load(paths);
});
afterAll(() => rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }));

const fresh = () => {
  now = 1_000_000_000_000;
  sessions = new SessionStore(resolveHomePaths(dir), tokens, () => now);
  return sessions.create().id;
};

describe('session lifetime (CA-03)', () => {
  it('CA-03: the documented limits are 8 h idle and 24 h absolute', () => {
    expect(SESSION_TTL_MS).toBe(8 * H);
    expect(SESSION_MAX_AGE_MS).toBe(24 * H);
  });

  it('CA-03: idle for 8 h ends the session; 7 h 59 min does not', () => {
    const id = fresh();
    now += 8 * H - 60_000;
    expect(sessions.lookup(id)).not.toBeNull();
    const id2 = fresh();
    now += 8 * H;
    expect(sessions.lookup(id2)).toBeNull();
    expect(sessions.lookup(id2)).toBeNull(); // and it stays gone
  });

  it('CA-03: use slides the idle window, but never beyond 24 h from the login', () => {
    const id = fresh();
    for (let i = 0; i < 5; i++) {
      now += 4 * H;
      expect(sessions.lookup(id), `after ${(i + 1) * 4} h`).not.toBeNull();
    }
    // 20 h in, keep touching: alive until 24 h, dead after, even though never idle.
    now += 3 * H + 59 * 60_000;
    expect(sessions.lookup(id)).not.toBeNull();
    now += 2 * 60_000;
    expect(sessions.lookup(id)).toBeNull();
  });

  it('CA-03: peekKey does not slide the window, remove() ends the session, junk cookies never match', () => {
    const id = fresh();
    now += 7 * H;
    expect(sessions.peekKey(id)).not.toBeNull();
    now += 2 * H; // peek did not refresh lastSeen
    expect(sessions.lookup(id)).toBeNull();
    const id2 = fresh();
    expect(sessions.remove(id2)).toBe(true);
    expect(sessions.remove(id2)).toBe(false);
    expect(sessions.lookup(id2)).toBeNull();
    for (const junk of [undefined, '', 'x', 'A'.repeat(42), 'A'.repeat(44), `${'A'.repeat(42)}!`])
      expect(sessions.lookup(junk)).toBeNull();
  });

  it('CA-03: sessions persisted across a restart come back only while alive', async () => {
    const id = fresh();
    await sessions.flush();
    const later = new SessionStore(resolveHomePaths(dir), tokens, () => now + 9 * H);
    await later.load();
    expect(later.lookup(id)).toBeNull();
  });
});

describe('cookie and logout on the real server (CA-03)', () => {
  let server: TestServer;
  beforeAll(async () => {
    server = await startTestServer();
  });
  afterAll(() => server.stop());

  it('CA-03: the cookie is HttpOnly, SameSite=Strict, Path=/ and lives at most 8 h', async () => {
    const { readFile } = await import('node:fs/promises');
    const token = (await readFile(join(server.home, 'token'), 'utf8')).trim();
    const t = await rawRequest(server.port, {
      method: 'POST',
      path: '/api/auth/ticket',
      headers: { authorization: `Bearer ${token}` },
    });
    const { ticket } = JSON.parse(t.body) as { ticket: string };
    const cb = await rawRequest(server.port, { path: `/auth/callback?ticket=${ticket}` });
    const cookie = cb.headers['set-cookie']?.[0] ?? '';
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Path=\//);
    const maxAge = Number(/Max-Age=(\d+)/i.exec(cookie)?.[1]);
    expect(maxAge).toBeLessThanOrEqual(8 * 3600);
    expect(maxAge).toBeGreaterThan(0);
  });

  it('CA-03: POST /api/auth/logout needs Origin + CSRF, expires the cookie, and the old cookie is dead afterwards', async () => {
    const s = await login(server);
    const noCsrf = await rawRequest(server.port, {
      method: 'POST',
      path: '/api/auth/logout',
      headers: { cookie: s.cookie, origin: s.origin },
    });
    expect(noCsrf.status).toBeGreaterThanOrEqual(400);
    const foreign = await rawRequest(server.port, {
      method: 'POST',
      path: '/api/auth/logout',
      headers: { cookie: s.cookie, origin: 'http://evil.example', 'x-escritorio-csrf': s.csrf },
    });
    expect(foreign.status).toBe(403);
    expect(
      (await rawRequest(server.port, { path: '/api/session', headers: { cookie: s.cookie } }))
        .status,
    ).toBe(200);

    const ok = await rawRequest(server.port, {
      method: 'POST',
      path: '/api/auth/logout',
      headers: { cookie: s.cookie, origin: s.origin, 'x-escritorio-csrf': s.csrf },
    });
    expect(ok.status).toBe(204);
    expect(ok.headers['set-cookie']?.[0] ?? '').toMatch(
      /esc_sid=;|Max-Age=0|Expires=Thu, 01 Jan 1970/i,
    );
    expect(
      (await rawRequest(server.port, { path: '/api/session', headers: { cookie: s.cookie } }))
        .status,
    ).toBe(401);
    // Logging out twice is harmless.
    const twice = await rawRequest(server.port, {
      method: 'POST',
      path: '/api/auth/logout',
      headers: { cookie: s.cookie, origin: s.origin, 'x-escritorio-csrf': s.csrf },
    });
    expect(twice.status).toBeLessThan(500);
  });
});
