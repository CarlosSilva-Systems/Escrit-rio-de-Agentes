import { basename, join } from 'node:path';
import fastifyCookie from '@fastify/cookie';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyWebsocket from '@fastify/websocket';
import Fastify, { LogController, type FastifyInstance } from 'fastify';
import type { OfficeSnapshot } from '../shared/contracts';
import { ConfigStore, findProjectRoot, readPackageVersion, type ServerEnv } from './config';
import { ensureHome, removeRuntimeInfo, TokenStore, writeRuntimeInfo } from './home';
import {
  DEFAULT_RATE_LIMITS,
  registerAuth,
  SESSION_COOKIE,
  SessionStore,
  TicketStore,
  type RateLimits,
} from './http/auth';
import { registerErrorHandling } from './http/errors';
import { registerSecurityHeaders } from './http/guards/headers';
import { registerHostGuard } from './http/guards/host';
import { findPortOwner, LOOPBACK_HOST, NetContext, type PortOwner } from './http/net';
import { isApiLikePath, normalizeRequestPath } from './http/path';
import { registerStatic } from './http/static';
import { t } from './i18n';
import { createLoggerOptions, LogSink, pruneOldLogs } from './log';
import { WsHub } from './ws/hub';
import { emptySnapshot } from './ws/defaultSnapshot';

export interface BuildAppOptions {
  env: ServerEnv;
  /** Directory with the built SPA; `undefined` = `<project>/dist/web`, `null` = none. */
  webRoot?: string | null;
  /** Mirror log lines to stdout (foreground runs). */
  echoLogs?: boolean;
  limits?: Partial<RateLimits>;
  /** Builds the snapshot sent to each WS client on connect. */
  snapshot?: (ctx: ServerContext) => OfficeSnapshot;
  /** Hook for other modules (ingest, office...) to add routes after auth is in place. */
  extraRoutes?: (ctx: ServerContext) => Promise<void> | void;
  /** Called after `POST /api/admin/shutdown` (default: close the server). */
  onShutdownRequest?: () => void;
  version?: string;
}

export interface ServerContext {
  app: FastifyInstance;
  env: ServerEnv;
  net: NetContext;
  tokens: TokenStore;
  config: ConfigStore;
  sessions: SessionStore;
  tickets: TicketStore;
  hub: WsHub;
  version: string;
  webServed: boolean;
}

/** Builds the Fastify app with every guard, but does not listen. */
export async function buildApp(options: BuildAppOptions): Promise<ServerContext> {
  const { env } = options;
  const projectRoot = findProjectRoot(import.meta.url);
  const version = options.version ?? readPackageVersion(projectRoot);
  const webRoot =
    options.webRoot === undefined
      ? projectRoot
        ? join(projectRoot, 'dist', 'web')
        : null
      : options.webRoot;

  await ensureHome(env.paths);
  const tokens = await TokenStore.load(env.paths);
  const config = new ConfigStore(env.paths);
  await config.load();
  const getLang = () => config.get().lang;

  pruneOldLogs(env.paths.logsDir);
  const sink = new LogSink({
    logsDir: env.paths.logsDir,
    secrets: () => tokens.secrets(),
    echo: options.echoLogs ?? false,
  });

  const app = Fastify({
    logger: createLoggerOptions({ level: env.logLevel, sink }),
    logController: new LogController({ disableRequestLogging: true }),
    bodyLimit: 64 * 1024, // hook routes raise this to 1 MB on their own route
    forceCloseConnections: true,
  });

  const net = new NetContext(env.port);
  const limits: RateLimits = { ...DEFAULT_RATE_LIMITS, ...options.limits };
  const sessions = new SessionStore(env.paths, tokens);
  await sessions.load();
  const tickets = new TicketStore();

  // Order matters: headers first (so even a Host rejection carries the CSP), then Host guard.
  registerSecurityHeaders(app, net);
  registerHostGuard(app, net, getLang);
  registerErrorHandling(app, getLang);

  await app.register(fastifyCookie);
  await app.register(fastifyRateLimit, {
    global: true,
    max: limits.general,
    timeWindow: '1 minute',
    // Static files are not limited (a page load fetches many); API/auth/ws routes are.
    // Decided on the NORMALIZED path: `/%61uth/callback` is the same route as `/auth/callback`.
    allowList: (request) => !isApiLikePath(normalizeRequestPath(request.url)),
    // Requests with a valid session have their own bucket; everything else (probes without a
    // cookie, bad cookies) shares an anonymous per-address bucket, so a flood of 401s cannot
    // lock the UI out.
    keyGenerator: (request) => {
      const key = sessions.peekKey(request.cookies?.[SESSION_COOKIE]);
      return key ? `s:${key}` : `ip:${request.ip}`;
    },
    errorResponseBuilder: () => Object.assign(new Error('rate limited'), { statusCode: 429 }),
  });

  const ref: { ctx?: ServerContext } = {};
  const hub = new WsHub({
    serverVersion: version,
    snapshot: () =>
      options.snapshot
        ? options.snapshot(ref.ctx as ServerContext)
        : emptySnapshot(config.get(), Date.now()),
  });

  registerAuth(app, {
    tokens,
    tickets,
    sessions,
    net,
    getLang,
    version,
    limits,
    onSessionEnded: (key) => hub.closeSession(key),
    onShutdownRequest: () => {
      if (options.onShutdownRequest) options.onShutdownRequest();
      else void app.close();
    },
  });

  await app.register(fastifyWebsocket, { options: { maxPayload: 1024 } });
  hub.register(app);

  const ctx: ServerContext = {
    app,
    env,
    net,
    tokens,
    config,
    sessions,
    tickets,
    hub,
    version,
    webServed: false,
  };
  ref.ctx = ctx;
  if (options.extraRoutes) await options.extraRoutes(ctx);
  ctx.webServed = await registerStatic(app, webRoot, getLang);

  // An idle office makes no HTTP request, so the token files are also checked on a timer while
  // sockets are open (BUG-04): `token:rotate` revokes them within about a second.
  const rotationWatch = setInterval(() => {
    if (hub.clientCount() > 0) void tokens.reloadIfChanged().catch(() => false);
  }, 1000);
  rotationWatch.unref();
  app.addHook('onClose', async () => clearInterval(rotationWatch));

  // `token:rotate` (another process) invalidates every browser session and open socket.
  tokens.on('rotated', () => {
    sessions.clear();
    tickets.clear();
    hub.closeAll(4401, 'session invalidated');
    app.log.info('tokens rotated: sessions invalidated');
  });

  for (const file of tokens.aclFailures) {
    const name = basename(file);
    app.log.warn({ file: name }, t(getLang(), 'server.aclWarning', { file: name }));
  }
  for (const field of config.invalidFields) {
    app.log.warn({ field }, t(getLang(), 'server.configInvalidField', { field }));
  }

  // One metadata line per API/auth call (method, path without query, status, latency): no bodies.
  app.addHook('onResponse', async (request, reply) => {
    const path = normalizeRequestPath(request.url);
    if (path === '/api/health' || !(path.startsWith('/api/') || path.startsWith('/auth/'))) return;
    request.log.info(
      { method: request.method, path, status: reply.statusCode, ms: Math.round(reply.elapsedTime) },
      'request',
    );
  });

  app.addHook('onClose', async () => {
    hub.close();
    await sessions.flush().catch(() => undefined);
    await removeRuntimeInfo(env.paths, process.pid);
  });

  return ctx;
}

export class PortInUseError extends Error {
  constructor(
    readonly port: number,
    readonly owner: PortOwner | null,
  ) {
    super(`port ${port} in use`);
    this.name = 'PortInUseError';
  }
}

export class ListenError extends Error {
  constructor(
    readonly port: number,
    readonly reason: string,
  ) {
    super(`cannot listen on ${port}: ${reason}`);
    this.name = 'ListenError';
  }
}

/**
 * Builds the app, binds 127.0.0.1 (never another address, never another port) and publishes
 * `runtime.json`. A busy port is a clear error, not a fallback.
 */
export async function startServer(options: BuildAppOptions): Promise<ServerContext> {
  const ctx = await buildApp(options);
  try {
    await ctx.app.listen({ host: LOOPBACK_HOST, port: ctx.env.port });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    await ctx.app.close().catch(() => undefined);
    if (code === 'EADDRINUSE')
      throw new PortInUseError(ctx.env.port, await findPortOwner(ctx.env.port));
    throw new ListenError(ctx.env.port, code ?? (err as Error).message);
  }
  const address = ctx.app.server.address();
  if (address && typeof address === 'object') ctx.net.port = address.port;
  await writeRuntimeInfo(ctx.env.paths, {
    pid: process.pid,
    port: ctx.net.port,
    startedAt: Date.now(),
    version: ctx.version,
  });
  ctx.app.log.info(
    { port: ctx.net.port, pid: process.pid, version: ctx.version },
    'server listening',
  );
  return ctx;
}
