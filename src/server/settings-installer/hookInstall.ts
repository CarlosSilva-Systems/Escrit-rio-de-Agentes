import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { findProjectRoot } from '../config';
import { writeFileAtomic } from '../home/fsAtomic';
import type { HomePaths } from '../home/paths';

// `hooks:sync`: copies the hook runtime scripts (plain .cjs, no build) to a stable path outside
// OneDrive (`~/.escritorio-equipe/bin`) and records their SHA-256, so the server can tell at
// start whether the installed copy is the expected one (ADR-0004 §1).

export const SCRIPT_PATTERN = /^escritorio-[a-z-]+\.cjs$/;
export const MANIFEST_NAME = 'hooks.manifest.json';

export interface HookManifest {
  version: number;
  files: Record<string, string>;
}

const sha256 = (data: Uint8Array): string => createHash('sha256').update(data).digest('hex');

/** `<package root>/src/hook-runtime` (the repository is the install). */
export function hookRuntimeSourceDir(fromUrl: string = import.meta.url): string | null {
  const root = findProjectRoot(fromUrl);
  return root ? join(root, 'src', 'hook-runtime') : null;
}

/** `// @escritorio-hook-version N` header of a script; 0 when absent. */
export function readScriptVersion(source: string): number {
  const m = /@escritorio-hook-version\s+(\d+)/.exec(source.slice(0, 600));
  return m?.[1] ? Number(m[1]) : 0;
}

async function listScripts(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir)).filter((n) => SCRIPT_PATTERN.test(n)).sort();
  } catch {
    return [];
  }
}

export interface SyncResult {
  binDir: string;
  copied: string[];
  version: number;
}

export async function syncHookRuntime(paths: HomePaths, sourceDir: string): Promise<SyncResult> {
  const names = await listScripts(sourceDir);
  if (names.length === 0) throw new Error('no hook runtime scripts found');
  await mkdir(paths.binDir, { recursive: true });
  const manifest: HookManifest = { version: 0, files: {} };
  for (const name of names) {
    const bytes = await readFile(join(sourceDir, name));
    await writeFileAtomic(join(paths.binDir, name), bytes, { mode: 0o644 });
    manifest.files[name] = sha256(bytes);
    if (name === 'escritorio-hook.cjs')
      manifest.version = readScriptVersion(bytes.toString('utf8'));
  }
  await writeFileAtomic(
    join(paths.binDir, MANIFEST_NAME),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return { binDir: paths.binDir, copied: names, version: manifest.version };
}

export interface HookInstallStatus {
  installed: boolean;
  /** The installed hook script is byte-identical to the source one. */
  upToDate: boolean;
  installedVersion: number;
  expectedVersion: number;
}

export async function inspectHookInstall(
  paths: HomePaths,
  sourceDir: string | null,
): Promise<HookInstallStatus> {
  const read = (file: string) => readFile(file).catch(() => null);
  const installed = await read(join(paths.binDir, 'escritorio-hook.cjs'));
  const source = sourceDir ? await read(join(sourceDir, 'escritorio-hook.cjs')) : null;
  return {
    installed: installed !== null,
    upToDate: installed !== null && source !== null && sha256(installed) === sha256(source),
    installedVersion: installed ? readScriptVersion(installed.toString('utf8')) : 0,
    expectedVersion: source ? readScriptVersion(source.toString('utf8')) : 0,
  };
}
