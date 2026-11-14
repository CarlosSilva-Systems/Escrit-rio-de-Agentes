import { copyFile, readFile } from 'node:fs/promises';
import { writeFileAtomic } from '../home/fsAtomic';
import { createBackup, listBackups, readTextOrNull } from './files';
import { detectFormat, parseSettingsText, serialize, stableStringify } from './format';
import { isRealUserSettings } from './guards';
import { removeOurs, type RevertChanges } from './merge';

// `settings:revert`: removes only the entries whose command contains `.escritorio-equipe` and
// restores a wrapped statusLine. When an earlier dated backup is equivalent to the reverted
// document, that backup's exact bytes are written back (byte-for-byte restore); otherwise the
// file is re-serialized with its own formatting. A fresh backup of the current file is taken first.

export interface RevertOptions {
  settingsPath: string;
  allowRealPath?: boolean;
  realSettingsPath?: string;
  now?: () => Date;
}

export type RevertResult =
  | {
      ok: true;
      changed: boolean;
      backupPath: string | null;
      /** The backup whose exact bytes were restored, if any. */
      restoredFrom: string | null;
      changes: RevertChanges;
    }
  | {
      ok: false;
      code:
        'real-path-refused' | 'file-missing' | 'invalid-json' | 'not-object' | 'validation-failed';
    };

export async function revertSettings(options: RevertOptions): Promise<RevertResult> {
  if (
    isRealUserSettings(options.settingsPath, options.realSettingsPath) &&
    !options.allowRealPath
  ) {
    return { ok: false, code: 'real-path-refused' };
  }
  const text = await readTextOrNull(options.settingsPath);
  if (text === null) return { ok: false, code: 'file-missing' };
  const parsed = parseSettingsText(text);
  if (!parsed.ok) return { ok: false, code: parsed.code };

  const { settings, changes } = removeOurs(parsed.value);
  if (changes.hookEntriesRemoved === 0 && changes.statusLine === 'unchanged') {
    return { ok: true, changed: false, backupPath: null, restoredFrom: null, changes };
  }

  const wanted = stableStringify(settings);
  let output = serialize(settings, detectFormat(text));
  let restoredFrom: string | null = null;
  for (const candidate of await listBackups(options.settingsPath)) {
    const candidateText = await readTextOrNull(candidate);
    if (candidateText === null) continue;
    const candidateParsed = parseSettingsText(candidateText);
    if (candidateParsed.ok && stableStringify(candidateParsed.value) === wanted) {
      output = candidateText;
      restoredFrom = candidate;
      break;
    }
  }

  const backupPath = await createBackup(
    options.settingsPath,
    (options.now ?? (() => new Date()))(),
  );
  await writeFileAtomic(options.settingsPath, output, { mode: 0o644 });

  const written = await readFile(options.settingsPath, 'utf8');
  const check = parseSettingsText(written);
  if (!check.ok || stableStringify(check.value) !== wanted || written !== output) {
    await copyFile(backupPath, options.settingsPath);
    return { ok: false, code: 'validation-failed' };
  }
  return { ok: true, changed: true, backupPath, restoredFrom, changes };
}
