import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { request as httpRequest, type IncomingHttpHeaders } from 'node:http';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer, type BuildAppOptions, type ServerContext } from '../../../src/server/app';
import { resolveHomePaths } from '../../../src/server/home';

export interface TestServer {
  ctx: ServerContext;
  port: number;
  home: string;
  stop: () => Promise<void>;
}

export interface RawResponse {
  status: number;
  headers: IncomingHttpHeaders;
  body: string;
}

/** Real Fastify server on 127.0.0.1 with an ephemeral port and a temporary home (never ~/.escritorio-equipe). */
export async function startTestServer(
  options: Partial<Omit<BuildAppOptions, 'env'>> & { port?: number } = {},
): Promise<TestServer> {
  const home = await mkdtemp(join(tmpdir(), 'escritorio-test-'));
  const { port = 0, ...rest } = options;
  const ctx = await startServer({
    webRoot: null,
    ...rest,
    env: {
      port,
      paths: resolveHomePaths(home),
      devRoot: home,
      logLevel: 'debug',
      claudeBin: undefined,
    },
  });
  return {
    ctx,
    port: ctx.net.port,
    home,
    stop: async () => {
      await ctx.app.close();
      await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    },
  };
}

/** Raw HTTP request to 127.0.0.1:port with full control of Host/Origin and other headers. */
export function rawRequest(
  port: number,
  options: { method?: string; path: string; headers?: Record<string, string>; body?: string },
): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        host: '127.0.0.1',
        port,
        method: options.method ?? 'GET',
        path: options.path,
        headers: { host: `127.0.0.1:${port}`, ...options.headers },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          }),
        );
      },
    );
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

export async function readMaster(server: TestServer): Promise<string> {
  return (await readFile(join(server.home, 'token'), 'utf8')).trim();
}

export interface LoggedInSession {
  cookie: string;
  csrf: string;
  origin: string;
}

/** Full launch flow: Bearer -> ticket -> /auth/callback -> cookie -> /api/session (CSRF). */
export async function login(server: TestServer): Promise<LoggedInSession> {
  const token = await readMaster(server);
  const ticketRes = await rawRequest(server.port, {
    method: 'POST',
    path: '/api/auth/ticket',
    headers: { authorization: `Bearer ${token}` },
  });
  const { ticket } = JSON.parse(ticketRes.body) as { ticket: string };
  const cb = await rawRequest(server.port, { path: `/auth/callback?ticket=${ticket}` });
  const setCookie = cb.headers['set-cookie']?.[0] ?? '';
  const cookie = setCookie.split(';')[0] ?? '';
  const sessionRes = await rawRequest(server.port, { path: '/api/session', headers: { cookie } });
  const { csrfToken } = JSON.parse(sessionRes.body) as { csrfToken: string };
  return { cookie, csrf: csrfToken, origin: `http://127.0.0.1:${server.port}` };
}

/** A currently free TCP port on 127.0.0.1 (small race window, fine for tests). */
export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}
