import { realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

// Safety net: the REAL `~/.claude/settings.json` is only ever written/reverted with the explicit
// long flag `--i-am-carlo-and-approved` (documented in the CLI help). Anything else (a copy in a
// temp folder, for instance) is not guarded.

export const REAL_PATH_FLAG = '--i-am-carlo-and-approved';

export function defaultUserSettingsPath(): string {
  return join(homedir(), '.claude', 'settings.json');
}

function canonical(path: string): string {
  const abs = resolve(path);
  try {
    return realpathSync.native(abs).toLowerCase();
  } catch {
    return abs.toLowerCase(); // the file may not exist yet
  }
}

/** true when `path` is the user's real Claude settings file (same file, case-insensitive). */
export function isRealUserSettings(
  path: string,
  real: string = defaultUserSettingsPath(),
): boolean {
  return canonical(path) === canonical(real);
}
