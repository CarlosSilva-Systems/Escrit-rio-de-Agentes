import { createInterface } from 'node:readline/promises';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { ConfigStore } from '../../server/config';
import type { Lang } from '../../server/i18n';
import {
  applySettings,
  CONFIRM_WORD,
  defaultUserSettingsPath,
  HOOK_SCRIPT,
  hookRuntimeSourceDir,
  isRealUserSettings,
  proposeSettings,
  readTextOrNull,
  REAL_PATH_FLAG,
  revertSettings,
  STATUSLINE_SCRIPT,
  syncHookRuntime,
  writeSessionSettings,
  type InstallLevel,
} from '../../server/settings-installer';
import type { CliContext } from '../launcher';
import { msg } from './messages';

// `settings:diff|apply|revert` and `hooks:sync` (T-17, T-18). `settings:diff` writes nothing.
// The real ~/.claude/settings.json is only written/reverted with REAL_PATH_FLAG.

export type Ask = (question: string) => Promise<string>;

export interface SettingsCommandDeps {
  /** Reads the typed confirmation (default: stdin, only when it is a terminal). */
  ask?: Ask;
  /** Whether stdin is an interactive terminal (default: `process.stdin.isTTY`). */
  isTTY?: () => boolean;
}

interface Parsed {
  values: Map<string, string>;
  flags: Set<string>;
  bad: string | null;
}

const VALUE_OPTIONS = new Set(['--level', '--settings-file', '--confirm']);
const FLAG_OPTIONS = new Set([REAL_PATH_FLAG]);

function parse(args: readonly string[]): Parsed {
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

function levelOf(parsed: Parsed, required: boolean): InstallLevel | 'missing' | 'bad' {
  const raw = parsed.values.get('--level');
  if (raw === undefined) return required ? 'missing' : 1;
  return raw === '1' ? 1 : raw === '2' ? 2 : 'bad';
}

const settingsFile = (parsed: Parsed): string =>
  parsed.values.get('--settings-file') ?? defaultUserSettingsPath();

function usageError(ctx: CliContext, lang: Lang, key: string, params = {}): number {
  ctx.err(msg(lang, key, params));
  ctx.err(msg(lang, 'usage.text'));
  return 2;
}

async function defaultAsk(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

const exists = (p: string) =>
  access(p).then(
    () => true,
    () => false,
  );

export function createSettingsCommands(deps: SettingsCommandDeps = {}) {
  const ask: Ask = deps.ask ?? defaultAsk;
  const tty = deps.isTTY ?? (() => Boolean(process.stdin.isTTY));

  /**
   * Confirmation of a write. On the REAL settings.json (M1) `--confirm` is ignored: only a person
   * typing the word in an interactive terminal counts, so a script or agent cannot approve it.
   * Returns null (after printing why) when it cannot be asked.
   */
  const confirmation = async (
    ctx: CliContext,
    real: boolean,
    typed: string | undefined,
    ttyKey: string,
  ): Promise<string | null> => {
    if (real) {
      if (typed !== undefined) ctx.err(msg(ctx.lang, 'apply.confirm-ignored'));
      if (!tty()) {
        ctx.err(msg(ctx.lang, ttyKey, { word: CONFIRM_WORD }));
        return null;
      }
      return ask(msg(ctx.lang, 'apply.prompt', { word: CONFIRM_WORD }));
    }
    if (typed !== undefined) return typed;
    if (!tty() && deps.ask === undefined) {
      ctx.err(msg(ctx.lang, 'apply.confirm-required', { word: CONFIRM_WORD }));
      return null;
    }
    return ask(msg(ctx.lang, 'apply.prompt', { word: CONFIRM_WORD }));
  };

  const diff = async (ctx: CliContext, args: string[]): Promise<number> => {
    const parsed = parse(args);
    if (parsed.bad !== null)
      return usageError(ctx, ctx.lang, 'usage.unknown-option', { option: parsed.bad });
    const level = levelOf(parsed, false);
    if (level === 'bad' || level === 'missing') return usageError(ctx, ctx.lang, 'usage.bad-level');
    const file = settingsFile(parsed);
    const binDir = ctx.env.paths.binDir;

    const text = await readTextOrNull(file);
    const result = proposeSettings(text, { level, binDir });
    if (!result.ok) {
      ctx.err(msg(ctx.lang, `error.${result.code}`, { detail: result.detail ?? '' }));
      return 1;
    }
    ctx.out(msg(ctx.lang, 'diff.header', { file, level }));
    if (text === null) ctx.out(msg(ctx.lang, 'diff.file-missing'));
    const { changes } = result;
    if (changes.hooksAdded.length > 0) {
      ctx.out(
        msg(ctx.lang, 'diff.summary-hooks', {
          count: changes.hooksAdded.length,
          events: changes.hooksAdded.join(', '),
        }),
      );
    }
    if (changes.hooksAlreadyPresent.length > 0) {
      ctx.out(
        msg(ctx.lang, 'diff.summary-present', {
          count: changes.hooksAlreadyPresent.length,
          events: changes.hooksAlreadyPresent.join(', '),
        }),
      );
    }
    if (level === 2) {
      ctx.out(
        msg(ctx.lang, 'diff.summary-statusline', {
          action: msg(ctx.lang, `diff.statusline.${changes.statusLine}`),
        }),
      );
    }
    if (result.diff === '') {
      ctx.out(msg(ctx.lang, 'diff.nothing'));
    } else {
      ctx.out('');
      ctx.out(result.diff.replace(/\n$/, ''));
      ctx.out('');
      ctx.out(msg(ctx.lang, 'diff.untouched'));
    }
    const script = level === 1 ? HOOK_SCRIPT : STATUSLINE_SCRIPT;
    if (!(await exists(join(binDir, script)))) {
      ctx.out(msg(ctx.lang, 'diff.script-missing', { script, dir: binDir }));
    }
    return 0;
  };

  const apply = async (ctx: CliContext, args: string[]): Promise<number> => {
    const parsed = parse(args);
    if (parsed.bad !== null)
      return usageError(ctx, ctx.lang, 'usage.unknown-option', { option: parsed.bad });
    const level = levelOf(parsed, true);
    if (level === 'missing') return usageError(ctx, ctx.lang, 'usage.level-required');
    if (level === 'bad') return usageError(ctx, ctx.lang, 'usage.bad-level');
    const file = settingsFile(parsed);
    const allowRealPath = parsed.flags.has(REAL_PATH_FLAG);

    // Refuse the real file before even asking for the confirmation.
    if (isRealUserSettings(file) && !allowRealPath) {
      ctx.err(msg(ctx.lang, 'apply.real-refused'));
      return 1;
    }
    const confirm = await confirmation(
      ctx,
      isRealUserSettings(file),
      parsed.values.get('--confirm'),
      'apply.tty-required',
    );
    if (confirm === null) return 1;

    const config = new ConfigStore(ctx.env.paths);
    await config.load();
    const result = await applySettings({
      settingsPath: file,
      level,
      binDir: ctx.env.paths.binDir,
      approvalDeadlineSec: config.get().approvalDeadlineSec,
      confirm,
      allowRealPath,
    });
    if (!result.ok) {
      const key =
        result.code === 'real-path-refused'
          ? 'apply.real-refused'
          : result.code === 'confirmation-required'
            ? 'apply.confirm-required'
            : result.code === 'marker-missing'
              ? 'apply.marker-missing'
              : result.code === 'script-missing'
                ? 'apply.script-missing'
                : result.code === 'validation-failed'
                  ? 'apply.validation-failed'
                  : `error.${result.code}`;
      ctx.err(
        msg(ctx.lang, key, {
          word: CONFIRM_WORD,
          script: result.detail ?? '',
          dir: ctx.env.paths.binDir,
          detail: result.detail ?? '',
        }),
      );
      return 1;
    }
    if (!result.changed) ctx.out(msg(ctx.lang, 'apply.unchanged'));
    else if (result.backupPath) ctx.out(msg(ctx.lang, 'apply.done', { backup: result.backupPath }));
    else ctx.out(msg(ctx.lang, 'apply.done-no-backup'));
    return 0;
  };

  const revert = async (ctx: CliContext, args: string[]): Promise<number> => {
    const parsed = parse(args);
    if (parsed.bad !== null)
      return usageError(ctx, ctx.lang, 'usage.unknown-option', { option: parsed.bad });
    const file = settingsFile(parsed);
    if (isRealUserSettings(file)) {
      if (!parsed.flags.has(REAL_PATH_FLAG)) {
        ctx.err(msg(ctx.lang, 'revert.real-refused'));
        return 1;
      }
      const typed = await confirmation(
        ctx,
        true,
        parsed.values.get('--confirm'),
        'revert.tty-required',
      );
      if (typed === null) return 1;
      if (typed !== CONFIRM_WORD) {
        ctx.err(msg(ctx.lang, 'apply.confirm-required', { word: CONFIRM_WORD }));
        return 1;
      }
    }
    const result = await revertSettings({
      settingsPath: file,
      allowRealPath: parsed.flags.has(REAL_PATH_FLAG),
    });
    if (!result.ok) {
      const key =
        result.code === 'real-path-refused'
          ? 'revert.real-refused'
          : result.code === 'file-missing'
            ? 'revert.file-missing'
            : result.code === 'validation-failed'
              ? 'apply.validation-failed'
              : `error.${result.code}`;
      ctx.err(msg(ctx.lang, key, { file }));
      return 1;
    }
    if (!result.changed) {
      ctx.out(msg(ctx.lang, 'revert.unchanged'));
      return 0;
    }
    ctx.out(
      msg(ctx.lang, 'revert.done', {
        count: result.changes.hookEntriesRemoved,
        backup: result.backupPath ?? '-',
      }),
    );
    if (result.restoredFrom)
      ctx.out(msg(ctx.lang, 'revert.restored', { file: result.restoredFrom }));
    if (result.changes.statusLine === 'restored')
      ctx.out(msg(ctx.lang, 'revert.statusline-restored'));
    if (result.changes.statusLine === 'removed')
      ctx.out(msg(ctx.lang, 'revert.statusline-removed'));
    return 0;
  };

  /** `hooks:sync`: copies the runtime scripts and rebuilds the panel's claude-settings.json. */
  const sync = async (ctx: CliContext, args: string[]): Promise<number> => {
    const parsed = parse(args);
    if (parsed.bad !== null)
      return usageError(ctx, ctx.lang, 'usage.unknown-option', { option: parsed.bad });
    const sourceDir = hookRuntimeSourceDir();
    if (!sourceDir) {
      ctx.err(msg(ctx.lang, 'sync.source-missing'));
      return 1;
    }
    const copied = await syncHookRuntime(ctx.env.paths, sourceDir);
    ctx.out(
      msg(ctx.lang, 'sync.copied', {
        dir: copied.binDir,
        files: copied.copied.join(', '),
        version: copied.version,
      }),
    );
    const config = new ConfigStore(ctx.env.paths);
    await config.load();
    const session = await writeSessionSettings(ctx.env.paths, {
      userSettingsPath: settingsFile(parsed),
      approvalDeadlineSec: config.get().approvalDeadlineSec,
    });
    ctx.out(msg(ctx.lang, 'sync.session-settings', { file: session.file }));
    ctx.out(
      msg(
        ctx.lang,
        session.includeHooks ? 'sync.session-hooks-included' : 'sync.session-hooks-skipped',
      ),
    );
    ctx.out(msg(ctx.lang, 'sync.next'));
    return 0;
  };

  return { diff, apply, revert, sync };
}
