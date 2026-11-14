import { copyFile, readdir, readFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

// File helpers shared by apply/revert: dated backups and tolerant reads.

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/** `YYYYMMDD-HHMMSS` in local time. */
export function backupStamp(date: Date): string {
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

/** Byte-exact copy to `<file>.bak-YYYYMMDD-HHMMSS` (a suffix is added if the name is taken). */
export async function createBackup(file: string, date: Date): Promise<string> {
  const base = `${file}.bak-${backupStamp(date)}`;
  for (let n = 0; n < 100; n++) {
    const target = n === 0 ? base : `${base}-${n}`;
    try {
      await copyFile(file, target, 1 /* COPYFILE_EXCL */);
      return target;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    }
  }
  throw new Error('could not allocate a backup name');
}

/** Newest first. */
export async function listBackups(file: string): Promise<string[]> {
  const dir = dirname(file);
  const prefix = `${basename(file)}.bak-`;
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  return names
    .filter((n) => n.startsWith(prefix))
    .sort()
    .reverse()
    .map((n) => join(dir, n));
}

/** Reads a file as raw bytes decoded to text; `null` when it does not exist. */
export async function readTextOrNull(file: string): Promise<string | null> {
  try {
    return await readFile(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}
