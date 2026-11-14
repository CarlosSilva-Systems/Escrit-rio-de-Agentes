import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { resolveHomePaths, type HomePaths } from '../home/paths';

export const DEFAULT_PORT = 3200;
const DEV_FOLDER = '7 - DEV';

/**
 * Where "7 - DEV" lives when ESCRITORIO_DEV_ROOT is not set: derived from the OneDrive variables
 * and the user's home (no personal path in the code). The first candidate that exists wins;
 * otherwise the most common location is returned (the folder may be created later).
 */
export function resolveDefaultDevRoot(
  env: NodeJS.ProcessEnv = process.env,
  home: string = homedir(),
  exists: (path: string) => boolean = existsSync,
): string {
  const oneDrive = [env['OneDrive'], env['OneDriveConsumer'], join(home, 'OneDrive')].filter(
    (p): p is string => typeof p === 'string' && p.trim() !== '',
  );
  const candidates = [
    ...oneDrive.flatMap((base) => [
      join(base, 'Documentos', DEV_FOLDER),
      join(base, 'Documents', DEV_FOLDER),
    ]),
    join(home, 'Documents', DEV_FOLDER),
    join(home, 'Documentos', DEV_FOLDER),
  ];
  return candidates.find((c) => exists(c)) ?? join(home, 'Documents', DEV_FOLDER);
}

/**
 * Process configuration from environment variables (none is a secret; tokens live in files).
 * There is deliberately NO host option: the server only ever binds 127.0.0.1 (ADR-0005).
 */
export interface ServerEnv {
  /** 1-65535 from the environment; `0` (ephemeral) is only accepted programmatically (tests). */
  port: number;
  paths: HomePaths;
  devRoot: string;
  logLevel: 'trace' | 'debug' | 'info' | 'warn' | 'error';
  claudeBin: string | undefined;
}

const EnvSchema = z.object({
  ESCRITORIO_PORT: z.coerce.number().int().min(1).max(65535).default(DEFAULT_PORT),
  ESCRITORIO_HOME: z.string().optional(),
  ESCRITORIO_DEV_ROOT: z.string().min(1).optional(),
  ESCRITORIO_LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
  CLAUDE_BIN: z.string().optional(),
});

export class EnvError extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = 'EnvError';
  }
}

/** Treats empty strings (as in a copied `.env.example`) as "unset". */
function withoutEmpty(source: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of Object.keys(EnvSchema.shape)) {
    const value = source[key];
    if (value !== undefined && value.trim() !== '') out[key] = value;
  }
  return out;
}

export function loadServerEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  const parsed = EnvSchema.safeParse(withoutEmpty(source));
  if (!parsed.success) {
    throw new EnvError(
      parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    );
  }
  const env = parsed.data;
  return {
    port: env.ESCRITORIO_PORT,
    paths: resolveHomePaths(env.ESCRITORIO_HOME),
    devRoot: env.ESCRITORIO_DEV_ROOT ?? resolveDefaultDevRoot(source),
    logLevel: env.ESCRITORIO_LOG_LEVEL,
    claudeBin: env.CLAUDE_BIN,
  };
}
