import { spawn } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readSync, statSync } from 'node:fs';

import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ServerEnv } from '../server/config';
import { findProjectRoot } from '../server/config';
import { isProcessAlive, readMasterToken, readRuntimeInfo } from '../server/home';
import { t, type Lang } from '../server/i18n';
import { checkHealth } from './client';

export const START_TIMEOUT_MS = 20_000;
const POLL_MS = 250;

export interface CliContext {
  env: ServerEnv;
  lang: Lang;
  out: (line: string) => void;
  err: (line: string) => void;
}

export class CliError extends Error {}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Compiled server next to the compiled CLI: `dist/cli.js` -> `dist/server/index.js`. */
export function resolveServerEntry(): string {
  const here = fileURLToPath(import.meta.url);
  return join(here, '..', 'server', 'index.js');
}

export interface RunningServer {
  pid: number | null;
  version: string;
  token: string;
}

/** Healthy server on the configured port (authenticated with the master token), or `null`. */
export async function probeServer(ctx: CliContext): Promise<RunningServer | null> {
  const token = await readMasterToken(ctx.env.paths);
  if (!token) return null;
  const health = await checkHealth(ctx.env.port, token);
  if (!health) return null;
  const runtime = await readRuntimeInfo(ctx.env.paths);
  return { pid: runtime?.pid ?? null, version: health.version, token };
}

function readLogTail(file: string, fromOffset: number): string {
  try {
    const size = statSync(file).size;
    if (size <= fromOffset) return '';
    const length = Math.min(size - fromOffset, 4096);
    const buffer = Buffer.alloc(length);
    const fd = openSync(file, 'r');
    try {
      readSync(fd, buffer, 0, length, size - length);
    } finally {
      closeSync(fd);
    }
    return buffer.toString('utf8').trim();
  } catch {
    return '';
  }
}

/**
 * Idempotent start (CA-83): if a healthy server already answers on the port nothing is spawned;
 * otherwise the compiled server is started detached (hidden window, stdout/stderr to a log file)
 * and we wait until it is healthy. Two launchers racing both end up with exactly one server:
 * the loser fails to bind the port and exits.
 */
export async function ensureRunning(
  ctx: CliContext,
): Promise<RunningServer & { started: boolean }> {
  const existing = await probeServer(ctx);
  if (existing) return { ...existing, started: false };

  const entry = resolveServerEntry();
  if (!existsSync(entry)) {
    throw new CliError(t(ctx.lang, 'cli.serverEntryMissing', { file: entry }));
  }
  ctx.out(t(ctx.lang, 'cli.starting'));

  mkdirSync(ctx.env.paths.logsDir, { recursive: true });
  const logFile = join(ctx.env.paths.logsDir, 'server-stdout.log');
  const startOffset = existsSync(logFile) ? statSync(logFile).size : 0;
  const fd = openSync(logFile, 'a');

  // The environment is inherited as-is (ESCRITORIO_HOME/PORT...): no secret is ever placed in it,
  // the server reads its tokens from the files in the home directory.
  const child = spawn(process.execPath, [entry], {
    detached: true,
    stdio: ['ignore', fd, fd],
    windowsHide: true,
    shell: false,
    cwd: findProjectRoot(import.meta.url) ?? undefined,
  });
  closeSync(fd);
  let exitCode: number | null | undefined;
  child.on('exit', (code) => {
    exitCode = code ?? -1;
  });
  child.on('error', () => {
    exitCode = -1;
  });

  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_MS);
    const running = await probeServer(ctx);
    if (running) {
      child.unref();
      // `runtime.json` is written right after listen: give it a moment.
      for (let i = 0; i < 8 && running.pid === null; i++) {
        await sleep(100);
        running.pid = (await readRuntimeInfo(ctx.env.paths))?.pid ?? null;
      }
      return { ...running, started: true };
    }
    if (exitCode !== undefined) {
      const tail = readLogTail(logFile, startOffset);
      if (tail) ctx.err(tail);
      throw new CliError(t(ctx.lang, 'cli.startFailed', { code: exitCode ?? -1, logFile }));
    }
  }
  child.unref();
  throw new CliError(
    t(ctx.lang, 'cli.startTimeout', { seconds: START_TIMEOUT_MS / 1000, logFile }),
  );
}

/** Waits (up to `timeoutMs`) until the server stops answering. */
export async function waitUntilDown(ctx: CliContext, token: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await checkHealth(ctx.env.port, token, 800))) return true;
    await sleep(200);
  }
  return false;
}

export { isProcessAlive };
