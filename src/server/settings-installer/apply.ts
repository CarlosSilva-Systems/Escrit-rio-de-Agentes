import { access, copyFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { writeFileAtomic } from '../home/fsAtomic';
import { proposeSettings, type InstallLevel, type ProposeResult } from './diff';
import { createBackup, readTextOrNull } from './files';
import { parseSettingsText, stableStringify } from './format';
import { isRealUserSettings } from './guards';
import { HOOK_SCRIPT, STATUSLINE_SCRIPT, hookCommand, isOurs } from './hookCommand';
import type { MergeChanges } from './merge';

// `settings:apply` (ADR-0004 §3): dated backup first, additive merge, atomic write, JSON
// validated after the write (restored from the backup if it does not hold). The confirmation
// word must be typed. The real ~/.claude/settings.json additionally needs `allowRealPath`.

export const CONFIRM_WORD = 'APLICAR';

export interface ApplyOptions {
  settingsPath: string;
  level: InstallLevel;
  binDir: string;
  approvalDeadlineSec?: number;
  /** What the user typed; must be exactly `APLICAR`. */
  confirm: string;
  /** Required to touch the real `~/.claude/settings.json`. */
  allowRealPath?: boolean;
  /** Overrides the real path used by the guard (tests). */
  realSettingsPath?: string;
  now?: () => Date;
}

export type ApplyErrorCode =
  | 'confirmation-required'
  | 'real-path-refused'
  | 'script-missing'
  | 'marker-missing'
  | 'validation-failed'
  | Extract<ProposeResult, { ok: false }>['code'];

export type ApplyResult =
  | { ok: true; changed: boolean; backupPath: string | null; changes: MergeChanges }
  | { ok: false; code: ApplyErrorCode; detail?: string };

const exists = (p: string) =>
  access(p).then(
    () => true,
    () => false,
  );

export async function applySettings(options: ApplyOptions): Promise<ApplyResult> {
  if (
    isRealUserSettings(options.settingsPath, options.realSettingsPath) &&
    !options.allowRealPath
  ) {
    return { ok: false, code: 'real-path-refused' };
  }
  if (options.confirm !== CONFIRM_WORD) return { ok: false, code: 'confirmation-required' };

  // `revert` recognizes our entries by the marker in the command path.
  if (!isOurs(hookCommand(options.binDir))) return { ok: false, code: 'marker-missing' };

  const script = options.level === 1 ? HOOK_SCRIPT : STATUSLINE_SCRIPT;
  if (!(await exists(join(options.binDir, script)))) {
    return { ok: false, code: 'script-missing', detail: script };
  }

  const text = await readTextOrNull(options.settingsPath);
  const proposal = proposeSettings(text, {
    level: options.level,
    binDir: options.binDir,
    ...(options.approvalDeadlineSec !== undefined
      ? { approvalDeadlineSec: options.approvalDeadlineSec }
      : {}),
  });
  if (!proposal.ok)
    return {
      ok: false,
      code: proposal.code,
      ...(proposal.detail ? { detail: proposal.detail } : {}),
    };
  if (proposal.after === proposal.before && text !== null) {
    return { ok: true, changed: false, backupPath: null, changes: proposal.changes };
  }

  const backupPath =
    text === null
      ? null
      : await createBackup(options.settingsPath, (options.now ?? (() => new Date()))());
  await writeFileAtomic(options.settingsPath, proposal.after, { mode: 0o644 });

  // Validate what is on disk now; put the original back if anything is off.
  const written = await readFile(options.settingsPath, 'utf8');
  const parsed = parseSettingsText(written);
  const valid =
    parsed.ok &&
    stableStringify(parsed.value) === stableStringify(proposal.settings) &&
    written === proposal.after;
  if (!valid) {
    if (backupPath) await copyFile(backupPath, options.settingsPath);
    return { ok: false, code: 'validation-failed' };
  }
  return { ok: true, changed: true, backupPath, changes: proposal.changes };
}
