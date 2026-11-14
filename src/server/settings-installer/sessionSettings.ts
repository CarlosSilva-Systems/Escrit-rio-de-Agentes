import { join } from 'node:path';
import { writeFileAtomic } from '../home/fsAtomic';
import type { HomePaths } from '../home/paths';
import { readTextOrNull } from './files';
import { parseSettingsText } from './format';
import { planHooks, DEFAULT_APPROVAL_DEADLINE_SEC } from './hookCommand';
import { detectInstalled } from './merge';

// Level 0 (ADR-0004): panel-owned Claude sessions are started with
// `--settings ~/.escritorio-equipe/claude-settings.json`, which carries our hooks. The user's
// own settings.json is NOT touched. When Level 1 is installed there, the hooks are left out of
// this file so every event is not reported twice (statusLine joins in phase 3, T-65).

export interface SessionSettingsOptions {
  binDir: string;
  /** false = Level 1 is installed in the user's settings: do not repeat the hooks. */
  includeHooks: boolean;
  approvalDeadlineSec?: number;
}

export function buildSessionSettings(options: SessionSettingsOptions): Record<string, unknown> {
  if (!options.includeHooks) return {};
  return {
    hooks: planHooks({
      binDir: options.binDir,
      approvalDeadlineSec: options.approvalDeadlineSec ?? DEFAULT_APPROVAL_DEADLINE_SEC,
    }),
  };
}

export const sessionSettingsPath = (paths: HomePaths): string =>
  join(paths.root, 'claude-settings.json');

export interface WriteSessionSettingsOptions {
  userSettingsPath: string;
  approvalDeadlineSec?: number;
}

/** Writes the panel's `claude-settings.json` (atomic). Reads the user's settings only to detect Level 1. */
export async function writeSessionSettings(
  paths: HomePaths,
  options: WriteSessionSettingsOptions,
): Promise<{ file: string; includeHooks: boolean }> {
  const text = await readTextOrNull(options.userSettingsPath).catch(() => null);
  const parsed = text === null ? null : parseSettingsText(text);
  const level1 = parsed?.ok === true && detectInstalled(parsed.value).hooks;
  const body = buildSessionSettings({
    binDir: paths.binDir,
    includeHooks: !level1,
    ...(options.approvalDeadlineSec !== undefined
      ? { approvalDeadlineSec: options.approvalDeadlineSec }
      : {}),
  });
  const file = sessionSettingsPath(paths);
  await writeFileAtomic(file, `${JSON.stringify(body, null, 2)}\n`);
  return { file, includeHooks: !level1 };
}
