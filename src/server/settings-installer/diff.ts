import { maskSecrets } from '../../shared/events';
import { DEFAULT_FORMAT, detectFormat, parseSettingsText, serialize } from './format';
import { addHooks, wrapStatusLine, type MergeChanges, type SettingsError } from './merge';
import { unifiedDiff } from './unifiedDiff';

const SENSITIVE_KEY =
  /^(\s*"[^"]*(?:key|token|secret|pass|auth|cred|bearer)[^"]*"\s*:\s*)"(?:[^"\\]|\\.)*"/i;

/**
 * Context lines of the diff come from the user's own file and may sit next to a secret (an `env`
 * block, for instance): values of sensitive-looking keys and token-shaped strings are masked.
 * Added/removed lines are ours or are the very lines being changed, so they stay verbatim.
 */
export function maskDiffContextLine(line: string): string {
  return maskSecrets(line.replace(SENSITIVE_KEY, '$1"***"'));
}

// `settings:diff`: proposes the new settings text and the unified diff. Changes NOTHING on disk.

export type InstallLevel = 1 | 2;

export interface ProposeOptions {
  level: InstallLevel;
  /** Absolute path of `~/.escritorio-equipe/bin` (where `hooks:sync` copies the scripts). */
  binDir: string;
  approvalDeadlineSec?: number;
}

export type ProposeResult =
  | {
      ok: true;
      before: string;
      after: string;
      /** '' when nothing would change. */
      diff: string;
      changes: MergeChanges;
      settings: Record<string, unknown>;
    }
  | { ok: false; code: SettingsError | 'invalid-json' | 'not-object'; detail?: string };

/** `text === null` = the file does not exist yet (a new file would be created). */
export function proposeSettings(text: string | null, options: ProposeOptions): ProposeResult {
  const before = text ?? '';
  let current: Record<string, unknown> = {};
  if (text !== null) {
    const parsed = parseSettingsText(text);
    if (!parsed.ok) return { ok: false, code: parsed.code };
    current = parsed.value;
  }
  const merged =
    options.level === 1
      ? addHooks(current, {
          binDir: options.binDir,
          ...(options.approvalDeadlineSec !== undefined
            ? { approvalDeadlineSec: options.approvalDeadlineSec }
            : {}),
        })
      : wrapStatusLine(current, { binDir: options.binDir });
  if (!merged.ok)
    return { ok: false, code: merged.code, ...(merged.detail ? { detail: merged.detail } : {}) };

  const changed =
    merged.changes.hooksAdded.length > 0 ||
    merged.changes.statusLine === 'wrapped' ||
    merged.changes.statusLine === 'created';
  // Untouched documents keep their exact bytes.
  const after = changed
    ? serialize(merged.settings, text === null ? DEFAULT_FORMAT : detectFormat(text))
    : before;
  const diff = changed
    ? unifiedDiff(before, after, {
        fromLabel: 'settings.json (atual)',
        toLabel: `settings.json (proposto, nível ${options.level})`,
        mapContext: maskDiffContextLine,
      })
    : '';
  return { ok: true, before, after, diff, changes: merged.changes, settings: merged.settings };
}
