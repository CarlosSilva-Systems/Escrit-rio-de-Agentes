import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer } from '../../src/server/app';
import { resolveHomePaths } from '../../src/server/home';
import {
  login,
  rawRequest,
  startTestServer,
  type LoggedInSession,
  type TestServer,
} from './helpers/server';

describe('PATCH /api/config', () => {
  let server: TestServer;
  let s: LoggedInSession;
  beforeAll(async () => {
    server = await startTestServer();
    s = await login(server);
  });
  afterAll(() => server.stop());

  const patch = (body: unknown, headers: Record<string, string> = {}) =>
    rawRequest(server.port, {
      method: 'PATCH',
      path: '/api/config',
      headers: {
        cookie: s.cookie,
        origin: s.origin,
        'x-escritorio-csrf': s.csrf,
        'content-type': 'application/json',
        ...headers,
      },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });

  it('CA-30: without a session it is 401', async () => {
    const r = await rawRequest(server.port, {
      method: 'PATCH',
      path: '/api/config',
      headers: { 'content-type': 'application/json' },
      body: '{"sound":true}',
    });
    expect(r.status).toBe(401);
  });

  it('CA-30: without the CSRF header, or with a foreign Origin, it is 403', async () => {
    expect((await patch({ sound: true }, { 'x-escritorio-csrf': 'nope' })).status).toBe(403);
    expect((await patch({ sound: true }, { origin: 'http://evil.example' })).status).toBe(403);
  });

  it('CA-31: unknown fields, wrong types and an empty patch are 400; nothing changes', async () => {
    for (const body of [{ evil: 1 }, { lang: 'fr' }, { sound: 'yes' }, {}, '{ not json']) {
      expect((await patch(body)).status, JSON.stringify(body)).toBe(400);
    }
    const cfg = await rawRequest(server.port, {
      path: '/api/config',
      headers: { cookie: s.cookie },
    });
    expect(JSON.parse(cfg.body)).toMatchObject({ lang: 'pt-BR', sound: false });
  });

  it('CA-31: a valid patch returns the updated config and writes config.json atomically', async () => {
    const r = await patch({ lang: 'en', sound: true });
    expect(r.status).toBe(200);
    expect(JSON.parse(r.body)).toMatchObject({ lang: 'en', sound: true, music: false });
    const file = JSON.parse(readFileSync(join(server.home, 'config.json'), 'utf8'));
    expect(file).toMatchObject({ lang: 'en', sound: true });
    // server messages follow the saved language right away
    const denied = await rawRequest(server.port, { path: '/api/state' });
    expect(JSON.parse(denied.body).error.message).toBe('Unauthorized.');
  });
});

describe('config persistence across restarts', () => {
  it('CA-31: the saved language and sound survive a restart', async () => {
    const home = mkdtempSync(join(tmpdir(), 'cfg-restart-'));
    const env = {
      port: 0,
      paths: resolveHomePaths(home),
      devRoot: home,
      logLevel: 'error' as const,
      claudeBin: undefined,
    };
    try {
      const first = await startServer({ env, webRoot: null });
      const token = readFileSync(join(home, 'token'), 'utf8').trim();
      const ticket = JSON.parse(
        (
          await rawRequest(first.net.port, {
            method: 'POST',
            path: '/api/auth/ticket',
            headers: { authorization: `Bearer ${token}` },
          })
        ).body,
      ).ticket as string;
      const cb = await rawRequest(first.net.port, { path: `/auth/callback?ticket=${ticket}` });
      const cookie = (cb.headers['set-cookie']?.[0] ?? '').split(';')[0] ?? '';
      const csrf = JSON.parse(
        (await rawRequest(first.net.port, { path: '/api/session', headers: { cookie } })).body,
      ).csrfToken as string;
      const r = await rawRequest(first.net.port, {
        method: 'PATCH',
        path: '/api/config',
        headers: {
          cookie,
          origin: `http://127.0.0.1:${first.net.port}`,
          'x-escritorio-csrf': csrf,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ lang: 'en', sound: true }),
      });
      expect(r.status).toBe(200);
      await first.app.close();

      const second = await startServer({ env, webRoot: null });
      expect(second.config.get()).toMatchObject({ lang: 'en', sound: true });
      await second.app.close();
    } finally {
      rmSync(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
  });
});
