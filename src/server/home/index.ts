import { mkdir } from 'node:fs/promises';
import type { HomePaths } from './paths';

export * from './acl';
export * from './fsAtomic';
export * from './paths';
export * from './runtime';
export * from './tokens';

/** Creates the home directory tree (idempotent). */
export async function ensureHome(paths: HomePaths): Promise<void> {
  for (const dir of [paths.root, paths.logsDir, paths.binDir, paths.cacheDir]) {
    await mkdir(dir, { recursive: true });
  }
}
