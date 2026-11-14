import { win32 } from 'node:path';
import { validateProjectName } from '../../shared/text/projectName';
import type { ProjectRef } from '../../shared/contracts';

// `cwd` (from inside the JSONL; the folder slug is ambiguous) -> project under "7 - DEV"
// (CA-44). Pure string logic (Windows paths, case-insensitive); the PathJail does the real
// filesystem validation elsewhere. Only the project NAME or the folder basename leaves this
// function: the full path is never kept (CA-44, privacy).

export interface CwdProjectOptions {
  /** Maps a case-insensitive name to the real folder name (from the ProjectCatalog). */
  canonicalName?: (name: string) => string | undefined;
}

const stripExtendedPrefix = (p: string) => p.replace(/^\\\\\?\\(?!UNC\\)/i, '');

function normalize(p: string): string {
  const n = win32.normalize(stripExtendedPrefix(p.trim()));
  return n.length > 3 ? n.replace(/[\\/]+$/, '') : n;
}

export function cwdToProject(
  cwd: string | null | undefined,
  devRoot: string,
  opts: CwdProjectOptions = {},
): ProjectRef {
  if (typeof cwd !== 'string' || cwd.trim() === '') return { kind: 'unknown' };
  const root = normalize(devRoot);
  const path = normalize(cwd);
  const rootKey = root.toLowerCase();
  const pathKey = path.toLowerCase();

  if (pathKey === rootKey) return { kind: 'unknown' };
  if (pathKey.startsWith(`${rootKey}\\`)) {
    const rest = path.slice(root.length + 1);
    const first = rest.split('\\')[0] ?? '';
    const checked = validateProjectName(first);
    if (checked.ok) {
      const name = opts.canonicalName?.(checked.name) ?? checked.name;
      return { kind: 'dev', name };
    }
    // A first-level folder with an invalid name can never be a project: treat as outside.
    return { kind: 'outside', basename: first.slice(0, 100) || '?' };
  }
  const basename = win32.basename(path).slice(0, 100);
  return basename === '' ? { kind: 'unknown' } : { kind: 'outside', basename };
}
