// The REAL Fastify server (hooks -> OfficeState -> WS) in-process, on a temporary home, with the
// reserve team from a QUADRO.md fixture and the freshly built web app. Nothing touches ~/.claude or
// ~/.escritorio-equipe (the claude home is a temp dir; see ESCRITORIO_CLAUDE_HOME in the server).

import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BrowserContext } from '@playwright/test';
import { officeServerOptions } from '../../../src/server/office';
import {
  login,
  rawRequest,
  startTestServer,
  type TestServer,
} from '../../integration/helpers/server';

export interface RealOffice {
  origin: string;
  server: TestServer;
  claudeHome: string;
  /** POST a hook payload with the hook token (like escritorio-hook.cjs does). */
  hook: (payload: Record<string, unknown>) => Promise<number>;
  /** Sets the session cookie so the browser is "logged in" (the launcher ticket flow, CA-03). */
  signIn: (context: BrowserContext) => Promise<void>;
  stop: () => Promise<void>;
}

export async function startRealOffice(webRoot: string): Promise<RealOffice> {
  const claudeHome = mkdtempSync(join(tmpdir(), 'claude-home-e2e-'));
  mkdirSync(join(claudeHome, 'projects'), { recursive: true });
  mkdirSync(join(claudeHome, 'equipe'), { recursive: true });
  cpSync(
    join(process.cwd(), 'tests', 'fixtures', 'team', 'QUADRO.sample.md'),
    join(claudeHome, 'equipe', 'QUADRO.md'),
  );
  const opts = officeServerOptions({
    claudeHome,
    mapPath: null,
    watchJsonl: false,
    flushMs: 10,
  });
  const server = await startTestServer({
    extraRoutes: opts.extraRoutes,
    snapshot: opts.snapshot,
    webRoot,
  });
  const session = await login(server);
  const hookToken = readFileSync(join(server.home, 'hook-token'), 'utf8').trim();
  const [name, value] = session.cookie.split('=') as [string, string];
  const origin = `http://127.0.0.1:${server.port}`;
  return {
    origin,
    server,
    claudeHome,
    hook: async (payload) => {
      const res = await rawRequest(server.port, {
        method: 'POST',
        path: '/api/hooks/v1/claude',
        headers: { authorization: `Bearer ${hookToken}`, 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return res.status;
    },
    signIn: (context) => context.addCookies([{ name, value, url: origin }]),
    stop: async () => {
      await server.stop();
      rmSync(claudeHome, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    },
  };
}
