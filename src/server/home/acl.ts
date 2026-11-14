import { execFile } from 'node:child_process';
import { chmod } from 'node:fs/promises';
import { userInfo } from 'node:os';
import { join } from 'node:path';

export interface AclResult {
  ok: boolean;
  reason?: string;
}

/**
 * Restricts a secret file to the current user (ADR-0005). Windows: `icacls /inheritance:r
 * /grant:r user:F`; elsewhere `chmod 600`. Best effort: the caller logs a warning on failure.
 * `execFile` without a shell; the file path is an argv element, never interpolated.
 */
export async function restrictToCurrentUser(file: string): Promise<AclResult> {
  if (process.platform !== 'win32') {
    try {
      await chmod(file, 0o600);
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: (err as Error).message };
    }
  }
  const icacls = join(process.env['SystemRoot'] ?? 'C:\\Windows', 'System32', 'icacls.exe');
  const user = userInfo().username;
  return new Promise<AclResult>((resolve) => {
    execFile(
      icacls,
      [file, '/inheritance:r', '/grant:r', `${user}:F`],
      { windowsHide: true, shell: false, timeout: 10_000 },
      (error) => resolve(error ? { ok: false, reason: error.message } : { ok: true }),
    );
  });
}
