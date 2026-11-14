// Test double for the Fastify server (which another block owns): serves a fresh `vite build` of the
// web app plus the few REST routes the shell calls. WebSocket traffic is mocked per page with
// Playwright's `page.routeWebSocket`, so no extra dependency is needed.

import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type Server, type ServerResponse } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { build } from 'vite';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json',
  '.png': 'image/png',
  '.ttf': 'font/ttf',
  '.svg': 'image/svg+xml',
};

export interface AppServer {
  url: string;
  /** `ok` serves /api/session; `unauthorized` answers 401 (CA-03). */
  setSession(mode: 'ok' | 'unauthorized'): void;
  /** Bodies received by PATCH /api/config, in order, with the CSRF header seen. */
  patches: { body: unknown; csrf: string | undefined; origin: string | undefined }[];
  close(): Promise<void>;
}

export const CSRF_TOKEN = 'test-csrf-token-0123456789abcdef';

export async function buildWeb(outDir: string): Promise<void> {
  await build({
    configFile: join(process.cwd(), 'vite.config.ts'),
    logLevel: 'silent',
    build: { outDir, emptyOutDir: true, sourcemap: false },
  });
}

export async function startAppServer(distDir: string): Promise<AppServer> {
  let session: 'ok' | 'unauthorized' = 'ok';
  const patches: AppServer['patches'] = [];

  const json = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };

  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (url.pathname === '/api/session') {
      if (session === 'unauthorized')
        return json(res, 401, { error: { code: 'unauthorized', message: 'no session' } });
      return json(res, 200, { csrfToken: CSRF_TOKEN, lang: 'pt-BR' });
    }
    if (url.pathname === '/api/config' && req.method === 'PATCH') {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        patches.push({
          body: JSON.parse(raw || 'null'),
          csrf: req.headers['x-escritorio-csrf'] as string | undefined,
          origin: req.headers.origin,
        });
        json(res, 200, {});
      });
      return;
    }
    if (
      url.pathname.startsWith('/api/') ||
      url.pathname.startsWith('/assets/') ||
      url.pathname.startsWith('/assets-private/')
    ) {
      // Optional art/map files: absent here, so the app uses its provisional map and code-drawn art.
      if (!existsSync(join(distDir, normalize(url.pathname))))
        return json(res, 404, { error: { code: 'not-found', message: 'missing' } });
    }
    const rel =
      url.pathname === '/' ? 'index.html' : normalize(url.pathname).replace(/^[/\\]+/, '');
    const file = join(distDir, rel);
    if (!file.startsWith(distDir) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('no address');
  return {
    url: `http://127.0.0.1:${address.port}`,
    setSession: (mode) => void (session = mode),
    patches,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
