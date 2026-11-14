import { rm } from 'node:fs/promises';
import { z } from 'zod';
import { readJsonTolerant, writeFileAtomic } from './fsAtomic';
import type { HomePaths } from './paths';

/** `runtime.json`: where the running server lives. Never holds a secret. */
export const RuntimeInfoSchema = z.object({
  pid: z.number().int().positive(),
  port: z.number().int().min(1).max(65535),
  startedAt: z.number().int().nonnegative(),
  version: z.string().max(40),
});
export type RuntimeInfo = z.infer<typeof RuntimeInfoSchema>;

export async function writeRuntimeInfo(paths: HomePaths, info: RuntimeInfo): Promise<void> {
  await writeFileAtomic(paths.runtimeFile, `${JSON.stringify(info, null, 2)}\n`);
}

/** Tolerant: missing, corrupt or stale-shaped files read as `null`. */
export async function readRuntimeInfo(paths: HomePaths): Promise<RuntimeInfo | null> {
  const parsed = RuntimeInfoSchema.safeParse(await readJsonTolerant(paths.runtimeFile));
  return parsed.success ? parsed.data : null;
}

/** Removes `runtime.json` only if it still describes this process (a newer server may own it). */
export async function removeRuntimeInfo(paths: HomePaths, pid: number): Promise<void> {
  const current = await readRuntimeInfo(paths);
  if (current && current.pid !== pid) return;
  await rm(paths.runtimeFile, { force: true }).catch(() => undefined);
}

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}
