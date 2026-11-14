import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Package root: nearest ancestor of `fromUrl` holding this project's package.json. */
export function findProjectRoot(fromUrl: string): string | null {
  let dir = dirname(fileURLToPath(fromUrl));
  for (let i = 0; i < 8; i++) {
    const manifest = join(dir, 'package.json');
    if (existsSync(manifest)) {
      try {
        const pkg = JSON.parse(readFileSync(manifest, 'utf8')) as { name?: string };
        if (pkg.name === 'escritorio-equipe') return dir;
      } catch {
        /* keep walking */
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function readPackageVersion(root: string | null): string {
  if (!root) return '0.0.0';
  try {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      version?: string;
    };
    return typeof pkg.version === 'string' ? pkg.version.slice(0, 40) : '0.0.0';
  } catch {
    return '0.0.0';
  }
}
