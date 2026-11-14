import { randomBytes } from 'node:crypto';
import { open, readFile, rename, rm } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

const RETRYABLE = new Set(['EPERM', 'EBUSY', 'EACCES']);
const RENAME_ATTEMPTS = 10;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * `rename` with retry: on Windows an antivirus/indexer/OneDrive handle on the target makes
 * the rename fail transiently with EPERM/EBUSY/EACCES.
 */
export async function renameWithRetry(
  from: string,
  to: string,
  renameImpl: (from: string, to: string) => Promise<void> = rename,
  delay: (ms: number) => Promise<void> = sleep,
): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await renameImpl(from, to);
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code ?? '';
      if (!RETRYABLE.has(code) || attempt >= RENAME_ATTEMPTS) throw err;
      await delay(15 * attempt);
    }
  }
}

export interface AtomicWriteOptions {
  /** POSIX mode of the new file (ignored on Windows). */
  mode?: number;
  /** Runs on the temp file before the rename (e.g. tighten the ACL, so the final file never exists with wide permissions). */
  beforeRename?: (tempFile: string) => Promise<void>;
}

/** Atomic write: temp file in the same directory + fsync + rename (with retry on Windows). */
export async function writeFileAtomic(
  file: string,
  data: string | Uint8Array,
  options: AtomicWriteOptions = {},
): Promise<void> {
  const temp = join(dirname(file), `.${basename(file)}.${randomBytes(6).toString('hex')}.tmp`);
  try {
    const handle = await open(temp, 'w', options.mode ?? 0o600);
    try {
      await handle.writeFile(data);
      await handle.sync();
    } finally {
      await handle.close();
    }
    if (options.beforeRename) await options.beforeRename(temp);
    await renameWithRetry(temp, file);
  } catch (err) {
    await rm(temp, { force: true }).catch(() => undefined);
    throw err;
  }
}

/** Reads a text file; returns `null` when it does not exist or cannot be read. Never throws. */
export async function readTextTolerant(file: string): Promise<string | null> {
  try {
    return await readFile(file, 'utf8');
  } catch {
    return null;
  }
}

/** Reads and JSON-parses a file; returns `null` on any failure. Never throws. */
export async function readJsonTolerant(file: string): Promise<unknown> {
  const text = await readTextTolerant(file);
  if (text === null) return null;
  try {
    return JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  } catch {
    return null;
  }
}
