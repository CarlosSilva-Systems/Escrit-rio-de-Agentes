import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createConnection, createServer } from 'node:net';
import { networkInterfaces, tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PortInUseError, startServer } from '../../src/server/app';
import { buildCsp } from '../../src/server/http/guards/headers';
import { resolveHomePaths } from '../../src/server/home';
import { login, rawRequest, readMaster, startTestServer, type TestServer } from './helpers/server';

const execFileAsync = promisify(execFile);

describe('server base (T-12)', () => {
  let server: TestServer;
  let webRoot: string;

  beforeAll(async () => {
    webRoot = await mkdtemp(join(tmpdir(), 'escritorio-web-'));
    await writeFile(join(webRoot, 'index.html'), '<!doctype html><title>office</title>');
    await mkdir(join(webRoot, 'assets'));
    await writeFile(join(webRoot, 'assets', 'app.js'), 'console.log(1)');
    server = await startTestServer({ webRoot });
  });
  afterAll(async () => {
    await server.stop();
    await rm(webRoot, { recursive: true, force: true });
  });

  it('CA-01: binds 127.0.0.1 only (socket address, netstat and LAN addresses)', async () => {
    const address = server.ctx.app.server.address();
    expect(address).toMatchObject({ address: '127.0.0.1', family: 'IPv4' });

    if (process.platform === 'win32') {
      const { stdout } = await execFileAsync('netstat.exe', ['-ano', '-p', 'TCP']);
      const listeners = stdout
        .split(/\r?\n/)
        .filter((l) => /LISTENING/.test(l) && new RegExp(`:${server.port}\\s`).test(l));
      expect(listeners.length).toBeGreaterThan(0);
      for (const line of listeners) expect(line).toMatch(/^\s*TCP\s+127\.0\.0\.1:/);
    }

    // No other interface answers on this port.
    const lan = Object.values(networkInterfaces())
      .flat()
      .filter((i) => i && i.family === 'IPv4' && !i.internal)
      .map((i) => i!.address);
    const results = await Promise.all(
      lan.map(async (host) => {
        const refused = await new Promise<boolean>((resolve) => {
          const socket = createConnection({ host, port: server.port, timeout: 1500 });
          socket.once('connect', () => {
            socket.destroy();
            resolve(false);
          });
          socket.once('error', () => resolve(true));
          socket.once('timeout', () => {
            socket.destroy();
            resolve(true);
          });
        });
        return { host, refused };
      }),
    );
    for (const { host, refused } of results) {
      expect(refused, `LAN address ${host} must not accept connections`).toBe(true);
    }
  });

  it('CA-01: there is no host option anywhere in the environment configuration', async () => {
    const { loadServerEnv } = await import('../../src/server/config');
    const env = loadServerEnv({ ESCRITORIO_HOST: '0.0.0.0', HOST: '0.0.0.0' } as NodeJS.ProcessEnv);
    expect(Object.keys(env)).not.toContain('host');
  });

  it('CA-30: a foreign Host header is rejected with 403 before routing', async () => {
    for (const host of [
      'evil.example.com',
      `evil.example.com:${server.port}`,
      '127.0.0.1',
      `127.0.0.1:${server.port + 1}`,
      `localhost`,
    ]) {
      const res = await rawRequest(server.port, { path: '/api/health', headers: { host } });
      expect(res.status, host).toBe(403);
      expect(JSON.parse(res.body).error.code).toBe('forbidden');
    }
  });

  it('CA-30: localhost:<port> is an accepted Host', async () => {
    const token = await readMaster(server);
    const res = await rawRequest(server.port, {
      path: '/api/health',
      headers: { host: `localhost:${server.port}`, authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
  });

  it('sends the ADR-0005 security headers on success, 401 and 403 responses, and no CORS', async () => {
    const token = await readMaster(server);
    const responses = [
      await rawRequest(server.port, {
        path: '/api/health',
        headers: { authorization: `Bearer ${token}` },
      }),
      await rawRequest(server.port, { path: '/api/health' }), // 401
      await rawRequest(server.port, { path: '/api/health', headers: { host: 'evil.test' } }), // 403
      await rawRequest(server.port, { path: '/' }), // 401 page
    ];
    expect(responses.map((r) => r.status)).toEqual([200, 401, 403, 401]);
    for (const res of responses) {
      expect(res.headers['content-security-policy']).toBe(buildCsp(server.port));
      expect(res.headers['referrer-policy']).toBe('no-referrer');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['cross-origin-opener-policy']).toBe('same-origin');
      expect(res.headers['cross-origin-resource-policy']).toBe('same-origin');
      expect(Object.keys(res.headers).filter((h) => h.startsWith('access-control-'))).toEqual([]);
    }
    expect(responses[0]!.headers['cache-control']).toBe('no-store');
    expect(buildCsp(server.port)).toContain(
      `connect-src 'self' ws://127.0.0.1:${server.port} ws://localhost:${server.port}`,
    );
    expect(buildCsp(server.port)).toContain("frame-ancestors 'none'");
  });

  it('CA-03: /api/health needs the master token (Bearer) or a session; wrong tokens get 401', async () => {
    const token = await readMaster(server);
    const ok = await rawRequest(server.port, {
      path: '/api/health',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(ok.status).toBe(200);
    expect(JSON.parse(ok.body)).toMatchObject({ ok: true, version: expect.any(String) });
    for (const authorization of [
      undefined,
      'Bearer nope',
      `Bearer ${token.slice(0, -1)}x`,
      `Basic ${token}`,
    ]) {
      const res = await rawRequest(server.port, {
        path: '/api/health',
        headers: authorization ? { authorization } : {},
      });
      expect(res.status, String(authorization)).toBe(401);
      expect(res.body).not.toContain(token);
    }
    // A Bearer request that carries an Origin is refused (local clients only).
    const withOrigin = await rawRequest(server.port, {
      path: '/api/health',
      headers: { authorization: `Bearer ${token}`, origin: `http://127.0.0.1:${server.port}` },
    });
    expect(withOrigin.status).toBe(403);
  });

  it('CA-03: static files and unknown paths are behind the session; the 401 page carries no data', async () => {
    for (const path of ['/', '/index.html', '/assets/app.js', '/nope', '/api/unknown']) {
      const res = await rawRequest(server.port, { path });
      expect(res.status, path).toBe(401);
      expect(res.body).not.toContain('office');
      expect(res.body).not.toContain('console.log');
    }
    const page = await rawRequest(server.port, { path: '/' });
    expect(page.headers['content-type']).toContain('text/html');
    expect(page.body).toContain('Abra o Escritório pelo atalho');
    expect(page.body).toContain('Open the Office with the');
    expect(page.body).not.toContain('<script');
    expect(page.body).not.toContain('<style');
  });

  it('serves dist/web to a logged-in session and rejects path traversal', async () => {
    const session = await login(server);
    const index = await rawRequest(server.port, { path: '/', headers: { cookie: session.cookie } });
    expect(index.status).toBe(200);
    expect(index.body).toContain('<title>office</title>');
    const asset = await rawRequest(server.port, {
      path: '/assets/app.js',
      headers: { cookie: session.cookie },
    });
    expect(asset.status).toBe(200);
    expect(asset.headers['content-type']).toMatch(/javascript/);

    for (const path of [
      '/..%2f..%2fpackage.json',
      '/%2e%2e/%2e%2e/package.json',
      '/..\\..\\package.json',
    ]) {
      const res = await rawRequest(server.port, { path, headers: { cookie: session.cookie } });
      expect([400, 403, 404], path).toContain(res.status);
      expect(res.body).not.toContain('escritorio-equipe');
    }
  });

  it('errors are uniform JSON without stack traces', async () => {
    const session = await login(server);
    const notFound = await rawRequest(server.port, {
      path: '/api/missing',
      headers: { cookie: session.cookie },
    });
    expect(notFound.status).toBe(404);
    expect(JSON.parse(notFound.body)).toEqual({
      error: { code: 'not_found', message: 'Não encontrado.' },
    });

    const token = await readMaster(server);
    const bad = await rawRequest(server.port, {
      method: 'POST',
      path: '/api/auth/ticket',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: '{not json',
    });
    expect(bad.status).toBe(400);
    expect(bad.body).not.toMatch(/at\s+\S+\s+\(|node_modules|SyntaxError/);

    const huge = await rawRequest(server.port, {
      method: 'POST',
      path: '/api/auth/ticket',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ pad: 'x'.repeat(70 * 1024) }),
    });
    expect(huge.status).toBe(413);
  });

  it('CA-02: a busy port is a clear error naming the port and owner, and never falls back', async () => {
    const home = await mkdtemp(join(tmpdir(), 'escritorio-test-'));
    try {
      const error = await startServer({
        webRoot: null,
        env: {
          port: server.port,
          paths: resolveHomePaths(home),
          devRoot: home,
          logLevel: 'error',
          claudeBin: undefined,
        },
      }).then(
        () => null,
        (err: unknown) => err,
      );
      expect(error).toBeInstanceOf(PortInUseError);
      const busy = error as PortInUseError;
      expect(busy.port).toBe(server.port);
      if (process.platform === 'win32') expect(busy.owner?.pid).toBe(process.pid);
      // The failed instance did not bind anywhere nor publish itself.
      await expect(readFile(join(home, 'runtime.json'), 'utf8')).rejects.toThrow();
    } finally {
      await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
  });

  it('publishes runtime.json (pid/port/version, no secret) and removes it on close', async () => {
    const other = await startTestServer();
    const runtimeFile = join(other.home, 'runtime.json');
    const text = await readFile(runtimeFile, 'utf8');
    expect(JSON.parse(text)).toMatchObject({ pid: process.pid, port: other.port });
    expect(text).not.toContain(await readMaster(other));
    await other.ctx.app.close();
    await expect(readFile(runtimeFile, 'utf8')).rejects.toThrow();
    await rm(other.home, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  it('shows a placeholder instead of failing when there is no web build', async () => {
    const bare = await startTestServer({ webRoot: null });
    try {
      const session = await login(bare);
      const res = await rawRequest(bare.port, { path: '/', headers: { cookie: session.cookie } });
      expect(res.status).toBe(200);
      expect(res.body).toContain('npm run build');
    } finally {
      await bare.stop();
    }
  });

  it('stops cleanly even with an open idle connection', async () => {
    const other = await startTestServer();
    const socket = createConnection({ host: '127.0.0.1', port: other.port });
    await new Promise((resolve) => socket.once('connect', resolve));
    socket.on('error', () => undefined);
    const started = Date.now();
    await other.stop();
    expect(Date.now() - started).toBeLessThan(3000);
    socket.destroy();
  });

  it('a raw TCP listener on the same port is impossible while the server runs (single instance)', async () => {
    const outcome = await new Promise<string>((resolve) => {
      const squatter = createServer();
      squatter.once('error', (e: NodeJS.ErrnoException) => resolve(e.code ?? 'error'));
      squatter.listen(server.port, '127.0.0.1', () => {
        squatter.close();
        resolve('bound');
      });
    });
    expect(outcome).toBe('EADDRINUSE');
  });
});
