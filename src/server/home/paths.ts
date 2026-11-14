import { homedir } from 'node:os';
import { join } from 'node:path';

/** Every file the server owns lives under one directory (default `~/.escritorio-equipe`). */
export interface HomePaths {
  root: string;
  tokenFile: string;
  hookTokenFile: string;
  configFile: string;
  runtimeFile: string;
  sessionsFile: string;
  logsDir: string;
  binDir: string;
  cacheDir: string;
}

export function resolveHomePaths(homeOverride?: string): HomePaths {
  const root =
    homeOverride !== undefined && homeOverride.trim() !== ''
      ? homeOverride
      : join(homedir(), '.escritorio-equipe');
  return {
    root,
    tokenFile: join(root, 'token'),
    hookTokenFile: join(root, 'hook-token'),
    configFile: join(root, 'config.json'),
    runtimeFile: join(root, 'runtime.json'),
    sessionsFile: join(root, 'sessions.json'),
    logsDir: join(root, 'logs'),
    binDir: join(root, 'bin'),
    cacheDir: join(root, 'cache'),
  };
}
