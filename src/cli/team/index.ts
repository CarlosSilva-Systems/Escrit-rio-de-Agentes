import { homedir } from 'node:os';
import { join } from 'node:path';
import { readTextOrNull } from '../../server/team/fsWatcher';
import { runTeamCheck } from './check';
import type { CliIo } from './check';
import { defaultInitDeps, runTeamInit } from './init';
import type { InitDeps } from './init';
import { tr } from './messages';
import type { CliLang } from './messages';

export { runTeamCheck, renderDiagnostic } from './check';
export type { CliIo, TeamCheckOptions } from './check';
export { runTeamInit } from './init';
export type { InitDeps, TeamInitOptions } from './init';
export { CLI_CATALOGS, tr } from './messages';
export type { CliLang } from './messages';

export const TEAM_COMMANDS = ['team:check', 'team:init'] as const;

const DEFAULT_PROPOSAL = join(
  'docs',
  'projeto',
  '2026-11-12-escritorio-equipe',
  'escritorio.proposta.json',
);
const DEFAULT_MAP = join('assets', 'map', 'mapa.json');

const VALUE_OPTIONS = new Set([
  '--quadro',
  '--escritorio',
  '--mapa',
  '--lang',
  '--proposal',
  '--dest',
]);
const FLAG_OPTIONS = new Set(['--confirm-approved', '--overwrite']);

interface ParsedArgs {
  values: Map<string, string>;
  flags: Set<string>;
  bad: string | null;
}

function parseArgs(args: readonly string[]): ParsedArgs {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const a = args[i] ?? '';
    if (FLAG_OPTIONS.has(a)) flags.add(a);
    else if (VALUE_OPTIONS.has(a)) {
      const v = args[i + 1];
      if (v === undefined || v.startsWith('--')) return { values, flags, bad: a };
      values.set(a, v);
      i++;
    } else return { values, flags, bad: a };
  }
  return { values, flags, bad: null };
}

export interface TeamCliEnv {
  /** Home directory (defaults to os.homedir()). */
  home?: string;
  io?: CliIo;
  initDeps?: InitDeps;
}

export const defaultCliIo = (): CliIo => ({
  out: (l) => process.stdout.write(`${l}\n`),
  err: (l) => process.stderr.write(`${l}\n`),
  readText: readTextOrNull,
});

/** Runs `team:check` / `team:init`. `argv` = [command, ...options]. Returns the exit code. */
export async function runTeamCli(argv: readonly string[], env: TeamCliEnv = {}): Promise<number> {
  const io = env.io ?? defaultCliIo();
  const [command, ...rest] = argv;
  const parsed = parseArgs(rest);
  const langOpt = parsed.values.get('--lang');
  const lang: CliLang = langOpt === 'en' ? 'en' : 'pt-BR';

  if (command !== 'team:check' && command !== 'team:init') {
    io.err(tr(lang, 'usage.unknown-command', { command: command ?? '' }));
    io.err(tr(lang, 'usage.text'));
    return 2;
  }
  if (parsed.bad !== null) {
    io.err(tr(lang, 'usage.unknown-option', { option: parsed.bad }));
    io.err(tr(lang, 'usage.text'));
    return 2;
  }
  const teamDir = join(env.home ?? homedir(), '.claude', 'equipe');

  if (command === 'team:check') {
    const mapOpt = parsed.values.get('--mapa');
    return runTeamCheck(
      {
        quadroPath: parsed.values.get('--quadro') ?? join(teamDir, 'QUADRO.md'),
        escritorioPath: parsed.values.get('--escritorio') ?? join(teamDir, 'escritorio.json'),
        mapPath: mapOpt ?? DEFAULT_MAP,
        mapExplicit: mapOpt !== undefined,
        lang,
      },
      io,
    );
  }
  return runTeamInit(
    {
      proposalPath: parsed.values.get('--proposal') ?? DEFAULT_PROPOSAL,
      destPath: parsed.values.get('--dest') ?? join(teamDir, 'escritorio.json'),
      confirmApproved: parsed.flags.has('--confirm-approved'),
      overwrite: parsed.flags.has('--overwrite'),
      lang,
    },
    env.initDeps ?? defaultInitDeps(io),
  );
}
