import { ListenError, PortInUseError, startServer, type ServerContext } from './app';
import { ConfigStore, EnvError, loadServerEnv, type ServerEnv } from './config';
import { DEFAULT_LANG, resolveLang, t, type Lang } from './i18n';
import { officeServerOptions } from './office';

const SHUTDOWN_GRACE_MS = 8000;

async function readLang(env: ServerEnv): Promise<Lang> {
  const store = new ConfigStore(env.paths);
  await store.load();
  return resolveLang(store.get().lang);
}

async function main(): Promise<void> {
  let env: ServerEnv;
  try {
    env = loadServerEnv();
  } catch (err) {
    if (err instanceof EnvError) {
      process.stderr.write(`${t(DEFAULT_LANG, 'server.invalidEnv', { reason: err.reason })}\n`);
      process.exit(2);
    }
    throw err;
  }
  const lang = await readLang(env);

  let ctx: ServerContext | undefined;
  let stopping = false;
  const shutdown = (reason: string) => {
    if (stopping) return;
    stopping = true;
    process.stdout.write(`${t(lang, 'server.stopping')}\n`);
    ctx?.app.log.info({ reason }, 'server stopping'); // logged BEFORE close()
    const force = setTimeout(() => process.exit(1), SHUTDOWN_GRACE_MS);
    force.unref();
    void (ctx?.app.close() ?? Promise.resolve()).finally(() => {
      ctx?.app.log.info({ reason }, 'server stopped');
      process.exit(0);
    });
  };

  // Handlers first: a signal (or a stray error) during start-up must also shut down cleanly.
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGBREAK'] as const) {
    process.on(signal, () => shutdown(signal));
  }
  // Message only: an error object may carry request fragments (privacy); never the stack.
  const report = (kind: string, err: unknown) => {
    const message = err instanceof Error ? err.message : String(err).slice(0, 200);
    if (ctx) ctx.app.log.error({ errMessage: message }, kind);
    else process.stderr.write(`${kind}: ${message}\n`);
  };
  process.on('unhandledRejection', (reason) => report('unhandled rejection', reason));
  process.on('uncaughtException', (err) => {
    report('uncaught exception', err);
    shutdown('uncaughtException');
  });

  try {
    ctx = await startServer({
      ...officeServerOptions(),
      env,
      echoLogs: Boolean(process.stdout.isTTY),
      onShutdownRequest: () => shutdown('api'),
    });
  } catch (err) {
    if (err instanceof PortInUseError) {
      const owner = err.owner
        ? t(lang, 'server.portOwner', { name: err.owner.name ?? '?', pid: err.owner.pid })
        : '';
      process.stderr.write(`${t(lang, 'server.portInUse', { port: err.port, owner })}\n`);
      process.exit(3);
    }
    if (err instanceof ListenError) {
      process.stderr.write(
        `${t(lang, 'server.listenFailed', { port: err.port, reason: err.reason })}\n`,
      );
      process.exit(4);
    }
    throw err;
  }

  process.stdout.write(`${t(lang, 'server.started', { port: ctx.net.port })}\n`);
}

main().catch((err: unknown) => {
  // Message only: never the stack to a user-visible stream, never request content.
  process.stderr.write(`${(err as Error).message}\n`);
  process.exit(1);
});
