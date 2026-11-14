import { existsSync, watch } from 'node:fs';
import type { FSWatcher } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, dirname } from 'node:path';
import type { TeamWatcher } from './registry';

// Node adapters for the TeamRegistry: file reader and a debounced directory watcher.
// Watching the parent directory (not the file) survives atomic rename-replace saves and files
// that do not exist yet (~/.claude/equipe/escritorio.json is created later by `team:init`).

export async function readTextOrNull(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
}

export interface FsTeamWatcherOptions {
  debounceMs?: number;
  /** How often to look for a parent directory that does not exist yet. Default 5000. */
  missingDirPollMs?: number;
}

export function createFsTeamWatcher(opts: FsTeamWatcherOptions = {}): TeamWatcher {
  const debounceMs = opts.debounceMs ?? 300;
  const pollMs = opts.missingDirPollMs ?? 5000;
  return {
    watch(paths, onChange) {
      let timer: NodeJS.Timeout | null = null;
      const fire = () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          timer = null;
          onChange();
        }, debounceMs);
      };
      const names = new Set(paths.map((p) => basename(p).toLowerCase()));
      const dirs = [...new Set(paths.map((p) => dirname(p)))];
      const watchers = new Map<string, FSWatcher>();
      const pollers: NodeJS.Timeout[] = [];

      const attach = (dir: string): boolean => {
        if (!existsSync(dir)) return false;
        try {
          const w = watch(dir, { persistent: false }, (_event, name) => {
            if (name === null || names.has(String(name).toLowerCase())) fire();
          });
          w.on('error', () => {
            w.close();
            watchers.delete(dir);
            poll(dir);
          });
          watchers.set(dir, w);
          return true;
        } catch {
          return false;
        }
      };
      const poll = (dir: string) => {
        const t = setInterval(() => {
          if (attach(dir)) {
            clearInterval(t);
            fire(); // files may already exist in the new directory
          }
        }, pollMs);
        t.unref();
        pollers.push(t);
      };

      for (const dir of dirs) if (!attach(dir)) poll(dir);
      return () => {
        if (timer) clearTimeout(timer);
        for (const t of pollers) clearInterval(t);
        for (const w of watchers.values()) w.close();
        watchers.clear();
      };
    },
  };
}
