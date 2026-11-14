import { rm } from 'node:fs/promises';
import { readMasterToken, readRuntimeInfo, rotateTokenFiles } from '../server/home';
import { t } from '../server/i18n';
import { readTextOrNull } from '../server/team';
import { openBrowser } from './browser';
import { checkHealth, requestShutdown, requestTicket } from './client';
import {
  CliError,
  ensureRunning,
  isProcessAlive,
  probeServer,
  waitUntilDown,
  type CliContext,
} from './launcher';
import { createSettingsCommands } from './settings/commands';
import { runTeamCli } from './team';

export type CommandHandler = (ctx: CliContext, args: string[]) => Promise<number>;

/** `start`: starts the server in the background if it is down (idempotent). */
export const start: CommandHandler = async (ctx) => {
  const server = await ensureRunning(ctx);
  ctx.out(
    t(ctx.lang, server.started ? 'cli.started' : 'cli.alreadyRunning', {
      port: ctx.env.port,
      pid: server.pid ?? '?',
    }),
  );
  return 0;
};

/**
 * `open`: starts if needed, trades the master token for a single-use 60 s ticket and opens
 * `/auth/callback?ticket=...` in the default browser. The long-lived token never leaves this
 * process. `--no-browser` (or ESCRITORIO_NO_BROWSER=1) prints the one-time URL instead.
 */
export const open: CommandHandler = async (ctx, args) => {
  const server = await ensureRunning(ctx);
  if (!server.started) {
    ctx.out(t(ctx.lang, 'cli.alreadyRunning', { port: ctx.env.port, pid: server.pid ?? '?' }));
  }
  const ticket = await requestTicket(ctx.env.port, server.token);
  if (!ticket.ok) {
    throw new CliError(t(ctx.lang, 'cli.ticketFailed', { status: ticket.status }));
  }
  const url = `http://127.0.0.1:${ctx.env.port}/auth/callback?ticket=${encodeURIComponent(ticket.ticket)}`;
  if (args.includes('--no-browser') || process.env['ESCRITORIO_NO_BROWSER'] === '1') {
    ctx.out(t(ctx.lang, 'cli.openUrl', { url }));
    return 0;
  }
  ctx.out(t(ctx.lang, 'cli.opening'));
  try {
    await openBrowser(url);
  } catch (err) {
    throw new CliError(t(ctx.lang, 'cli.openFailed', { reason: (err as Error).message }));
  }
  return 0;
};

/** `status`: exit code 0 when running, 1 when not. */
export const status: CommandHandler = async (ctx) => {
  const server = await probeServer(ctx);
  if (!server) {
    ctx.out(t(ctx.lang, 'cli.notRunning'));
    return 1;
  }
  ctx.out(
    t(ctx.lang, 'cli.statusRunning', {
      port: ctx.env.port,
      pid: server.pid ?? '?',
      version: server.version,
    }),
  );
  return 0;
};

/** `stop`: graceful shutdown through the API; falls back to killing the recorded PID. */
export const stop: CommandHandler = async (ctx) => {
  const token = await readMasterToken(ctx.env.paths);
  const runtime = await readRuntimeInfo(ctx.env.paths);
  const healthy = token ? await checkHealth(ctx.env.port, token) : null;
  if (!token || !healthy) {
    ctx.out(t(ctx.lang, 'cli.notRunning'));
    return 0;
  }
  const accepted = await requestShutdown(ctx.env.port, token);
  if (accepted && (await waitUntilDown(ctx, token, 10_000))) {
    ctx.out(t(ctx.lang, 'cli.stopped'));
    return 0;
  }
  if (runtime && isProcessAlive(runtime.pid)) {
    process.kill(runtime.pid);
    if (await waitUntilDown(ctx, token, 5000)) {
      ctx.out(t(ctx.lang, 'cli.stopForced'));
      return 0;
    }
  }
  throw new CliError(t(ctx.lang, 'cli.stopFailed'));
};

/**
 * `token:rotate`: new master and hook tokens, every browser session invalidated. A running
 * server notices the changed files by itself (it drops sessions and open sockets).
 */
export const tokenRotate: CommandHandler = async (ctx) => {
  await rotateTokenFiles(ctx.env.paths);
  await rm(ctx.env.paths.sessionsFile, { force: true });
  ctx.out(t(ctx.lang, 'cli.tokenRotated'));
  return 0;
};

/** `team:check` / `team:init`: the team module parses its own options; language follows config.json. */
const teamCommand =
  (command: 'team:check' | 'team:init'): CommandHandler =>
  (ctx, args) =>
    runTeamCli([command, ...(args.includes('--lang') ? [] : ['--lang', ctx.lang]), ...args], {
      io: { out: ctx.out, err: ctx.err, readText: readTextOrNull },
    });

const settings = createSettingsCommands();

export const COMMANDS: Record<string, CommandHandler> = {
  start,
  open,
  stop,
  status,
  'token:rotate': tokenRotate,
  'team:check': teamCommand('team:check'),
  'team:init': teamCommand('team:init'),
  'settings:diff': settings.diff,
  'settings:apply': settings.apply,
  'settings:revert': settings.revert,
  'hooks:sync': settings.sync,
};
