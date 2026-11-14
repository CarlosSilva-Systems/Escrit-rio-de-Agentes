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
    const force = setTimeout(() => process.exit(1), SHUTDOWN_GRACE_MS);
    force.unref();
    void (ctx?.app.close() ?? Promise.resolve()).finally(() => {
      ctx?.app.log.info({ reason }, 'server stopped');
      process.exit(0);
    });
  };

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
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGBREAK'] as const) {
    process.on(signal, () => shutdown(signal));
  }
}

main().catch((err: unknown) => {
  // Message only: never the stack to a user-visible stream, never request content.
  process.stderr.write(`${(err as Error).message}\n`);
  process.exit(1);
});
