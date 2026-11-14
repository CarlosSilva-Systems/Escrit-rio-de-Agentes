// Shared helpers for the phase 1 QA specs (T-33). Everything runs on temporary homes: nothing here
// touches ~/.claude, ~/.escritorio-equipe or the real server on port 3200.

import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BrowserContext, ConsoleMessage, Page } from '@playwright/test';
import { startServer, type ServerContext } from '../../../src/server/app';
import { resolveHomePaths } from '../../../src/server/home';
import { officeServerOptions } from '../../../src/server/office';
import { freePort, login, rawRequest } from '../../integration/helpers/server';

export const FIXTURES = join(process.cwd(), 'tests', 'fixtures');

/** A real office server that can be killed and restarted on the SAME port and home (sessions persist). */
export interface RestartableOffice {
  origin: string;
  port: number;
  home: string;
  claudeHome: string;
  ctx: () => ServerContext;
  hook: (payload: Record<string, unknown>) => Promise<number>;
  signIn: (context: BrowserContext) => Promise<void>;
  /** GET with the session cookie. */
  get: (path: string) => Promise<{ status: number; body: string }>;
  /** Number of WebSocket clients the hub believes are connected. */
  clients: () => number;
  stop: () => Promise<void>;
  start: () => Promise<void>;
  cleanup: () => Promise<void>;
}

export async function startRestartableOffice(
  webRoot: string,
  options: { quadro?: boolean; escritorio?: string } = {},
): Promise<RestartableOffice> {
  const home = mkdtempSync(join(tmpdir(), 'escritorio-qa-'));
  const claudeHome = mkdtempSync(join(tmpdir(), 'claude-home-qa-'));
  mkdirSync(join(claudeHome, 'projects'), { recursive: true });
  mkdirSync(join(claudeHome, 'equipe'), { recursive: true });
  if (options.quadro !== false) {
    cpSync(join(FIXTURES, 'team', 'QUADRO.sample.md'), join(claudeHome, 'equipe', 'QUADRO.md'));
  }
  if (options.escritorio) {
    cpSync(options.escritorio, join(claudeHome, 'equipe', 'escritorio.json'));
  }
  const port = await freePort();
  let ctx: ServerContext | null = null;
  let cookie = '';
  let hookToken = '';

  const start = async () => {
    const opts = officeServerOptions({ claudeHome, mapPath: null, watchJsonl: false, flushMs: 10 });
    ctx = await startServer({
      webRoot,
      extraRoutes: opts.extraRoutes,
      snapshot: opts.snapshot,
      env: {
        port,
        paths: resolveHomePaths(home),
        devRoot: home,
        logLevel: 'warn',
        claudeBin: undefined,
      },
    });
    hookToken = readFileSync(join(home, 'hook-token'), 'utf8').trim();
  };
  await start();
  const session = await login({ port, home } as Parameters<typeof login>[0]);
  cookie = session.cookie;
  const origin = `http://127.0.0.1:${port}`;

  return {
    origin,
    port,
    home,
    claudeHome,
    ctx: () => ctx as ServerContext,
    hook: async (payload) =>
      (
        await rawRequest(port, {
          method: 'POST',
          path: '/api/hooks/v1/claude',
          headers: { authorization: `Bearer ${hookToken}`, 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        })
      ).status,
    signIn: (context) => {
      const [name, value] = cookie.split('=') as [string, string];
      return context.addCookies([{ name, value, url: origin }]);
    },
    get: async (path) => {
      const res = await rawRequest(port, { path, headers: { cookie } });
      return { status: res.status, body: res.body };
    },
    clients: () => ctx?.hub.clientCount() ?? 0,
    start,
    stop: async () => {
      // Sessions are persisted with a 1 s debounce: let it land so the cookie survives the restart.
      await new Promise((r) => setTimeout(r, 1200));
      const c = ctx;
      ctx = null;
      await c?.app.close();
    },
    cleanup: async () => {
      await ctx?.app.close().catch(() => undefined);
      ctx = null;
      for (const d of [home, claudeHome])
        rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    },
  };
}

export interface ConsoleLog {
  /** Console errors, without the browser's generic "Failed to load resource" lines (see `notFound`). */
  errors: string[];
  warnings: string[];
  /** URLs that answered 4xx. Only the optional art manifests are expected (OBS-01). */
  notFound: string[];
}

export const OPTIONAL_ASSETS = [
  '/assets/sprites/manifest.json',
  '/assets-private/sprites/manifest.json',
];

/** Collects console errors/warnings and uncaught page errors (to be asserted at the end of a test). */
export function watchConsole(page: Page): ConsoleLog {
  const log: ConsoleLog = { errors: [], warnings: [], notFound: [] };
  page.on('console', (m: ConsoleMessage) => {
    if (m.type() === 'error' && !/^Failed to load resource/.test(m.text()))
      log.errors.push(m.text());
    else if (m.type() === 'warning') log.warnings.push(m.text());
  });
  page.on('response', (r) => {
    if (r.status() >= 400) log.notFound.push(new URL(r.url()).pathname + ' ' + r.status());
  });
  page.on('pageerror', (e) => log.errors.push(`pageerror: ${e.message}`));
  return log;
}

export type NpcRow = { key: string; mode: string; anim: string; tile: [number, number] };
export type Dbg = Window & {
  __officeDebug?: {
    npcs: () => NpcRow[];
    metrics: () => {
      rendered: number;
      renderedWhileHidden: number;
      fps: number;
      scale: number;
      dpr: number;
      zoom: number;
      canvasWidth: number;
      canvasHeight: number;
    };
    frameTimestamps: () => number[];
    engine: {
      zoom: number;
      debugSprites: () => { id: string; x: number; y: number }[];
      tileToCss: (x: number, y: number) => { x: number; y: number } | null;
    };
  };
};

export async function openReal(
  office: RestartableOffice,
  page: Page,
  query = '?debug',
  minNpcs = 16,
): Promise<void> {
  await office.signIn(page.context());
  await page.goto(`${office.origin}/${query}`);
  await page.waitForFunction(
    (n) => ((window as Dbg).__officeDebug?.npcs().length ?? 0) >= n,
    minNpcs,
    { timeout: 20_000 },
  );
}

export const npcRows = (page: Page) => page.evaluate(() => (window as Dbg).__officeDebug!.npcs());

export const SESSION_ID = '3f1c2f9e-8a7b-4c1d-9b6e-2a5d7c8e9f10';
export const startHook = (type: string, id: string, cwd = 'C:\\dev\\Sites') => ({
  hook_event_name: 'SubagentStart',
  session_id: SESSION_ID,
  cwd,
  agent_id: id,
  agent_type: type,
});
export const stopHook = (type: string, id: string, cwd = 'C:\\dev\\Sites') => ({
  ...startHook(type, id, cwd),
  hook_event_name: 'SubagentStop',
});

/** The 16 fixed agent types of the QUADRO.sample.md fixture / reserve team. */
export const FIXED_TYPES = [
  'chefe',
  'analista',
  'arquiteto',
  'designer-ux',
  'dev-web',
  'dev-backend',
  'dev-odoo',
  'dev-embarcados',
  'dev-automacao',
  'testador-qa',
  'revisor-codigo',
  'revisor-seguranca',
  'pentester',
  'git-github',
  'documentador',
  'pesquisador',
] as const;
