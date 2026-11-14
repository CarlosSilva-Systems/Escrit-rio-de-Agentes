import { ConfigStore, EnvError, loadServerEnv } from '../server/config';
import { DEFAULT_LANG, resolveLang, t, type Lang } from '../server/i18n';
import { COMMANDS } from './commands';
import { CliError, type CliContext } from './launcher';

// `escritorio start|open|stop|status|token:rotate` (compiled to dist/cli.js).

async function main(argv: string[]): Promise<number> {
  const out = (line: string) => process.stdout.write(`${line}\n`);
  const err = (line: string) => process.stderr.write(`${line}\n`);

  let lang: Lang = DEFAULT_LANG;
  try {
    const env = loadServerEnv();
    const store = new ConfigStore(env.paths);
    await store.load();
    lang = resolveLang(store.get().lang);

    const [command, ...args] = argv;
    const handler = command ? COMMANDS[command] : undefined;
    if (!handler) {
      if (command) err(t(lang, 'cli.unknownCommand', { command }));
      out(t(lang, 'cli.usage'));
      return command ? 1 : 0;
    }
    const ctx: CliContext = { env, lang, out, err };
    return await handler(ctx, args);
  } catch (error) {
    if (error instanceof EnvError) {
      err(t(lang, 'server.invalidEnv', { reason: error.reason }));
    } else if (error instanceof CliError) {
      err(error.message);
    } else {
      err(t(lang, 'cli.error', { reason: (error as Error).message }));
    }
    return 1;
  }
}

process.exitCode = await main(process.argv.slice(2));
