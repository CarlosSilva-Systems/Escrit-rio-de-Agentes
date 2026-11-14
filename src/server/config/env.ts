import { z } from 'zod';
import { resolveHomePaths, type HomePaths } from '../home/paths';

export const DEFAULT_PORT = 3200;
export const DEFAULT_DEV_ROOT = 'C:\\Users\\carlo\\OneDrive\\Documentos\\7 - DEV';

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
  ESCRITORIO_DEV_ROOT: z.string().min(1).default(DEFAULT_DEV_ROOT),
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
    devRoot: env.ESCRITORIO_DEV_ROOT,
    logLevel: env.ESCRITORIO_LOG_LEVEL,
    claudeBin: env.CLAUDE_BIN,
  };
}
