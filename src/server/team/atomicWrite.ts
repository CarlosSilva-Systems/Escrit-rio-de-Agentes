import { randomBytes } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

// Atomic file write: temp file in the same folder + rename, retrying on the Windows
// EPERM/EBUSY errors that antivirus/indexers cause (CLAUDE.md: "Escrita de arquivo sempre atômica").

const RETRYABLE = new Set(['EPERM', 'EBUSY', 'EACCES']);

export async function writeFileAtomic(
  target: string,
  data: string,
  opts: { retries?: number; delayMs?: number } = {},
): Promise<void> {
  const retries = opts.retries ?? 3;
  const delayMs = opts.delayMs ?? 50;
  const dir = dirname(target);
  await mkdir(dir, { recursive: true });
  const tmp = join(dir, `.${randomBytes(6).toString('hex')}.tmp`);
  try {
    await writeFile(tmp, data, { encoding: 'utf8', flag: 'wx' });
    for (let attempt = 0; ; attempt++) {
      try {
        await rename(tmp, target);
        return;
      } catch (e) {
        const code = (e as NodeJS.ErrnoException).code ?? '';
        if (attempt >= retries || !RETRYABLE.has(code)) throw e;
        await new Promise((r) => setTimeout(r, delayMs * (attempt + 1)));
      }
    }
  } catch (e) {
    await rm(tmp, { force: true }).catch(() => undefined);
    throw e;
  }
}
