import { appendFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

/** Patterns that must never reach a log line, even if a code path logs them by mistake. */
const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/Bearer\s+[A-Za-z0-9._~+/=-]{16,}/gi, 'Bearer [redacted]'],
  [/esc_sid=[A-Za-z0-9_-]{8,}/g, 'esc_sid=[redacted]'],
  [/([?&"']ticket[=":\s]+)[A-Za-z0-9_-]{16,}/gi, '$1[redacted]'],
];

export const LOG_RETENTION_DAYS = 7;
const LOG_FILE_PATTERN = /^escritorio-(\d{4})-(\d{2})-(\d{2})\.log$/;

export interface LogSinkOptions {
  logsDir: string;
  /** Current secret values (tokens); any occurrence is replaced before writing. */
  secrets: () => string[];
  /** Also write each line to stdout (foreground runs). */
  echo?: boolean;
  now?: () => Date;
}

function localDateStamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Removes `escritorio-YYYY-MM-DD.log` files older than the retention window. Never throws. */
export function pruneOldLogs(logsDir: string, now: Date = new Date()): void {
  const limit = new Date(now.getFullYear(), now.getMonth(), now.getDate() - LOG_RETENTION_DAYS);
  try {
    for (const name of readdirSync(logsDir)) {
      const match = LOG_FILE_PATTERN.exec(name);
      if (!match) continue;
      const fileDate = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
      if (fileDate < limit) rmSync(join(logsDir, name), { force: true });
    }
  } catch {
    /* logging must never break the server */
  }
}

/**
 * pino destination: one file per local day (`escritorio-YYYY-MM-DD.log`), secrets scrubbed
 * from every line (defence in depth on top of pino `redact` and the request serializers).
 */
export class LogSink {
  constructor(private readonly options: LogSinkOptions) {}

  scrub(line: string): string {
    let out = line;
    for (const secret of this.options.secrets()) {
      if (secret.length >= 16) out = out.split(secret).join('[redacted]');
    }
    for (const [pattern, replacement] of SECRET_PATTERNS) out = out.replace(pattern, replacement);
    return out;
  }

  write(line: string): void {
    const clean = this.scrub(line);
    try {
      const stamp = localDateStamp((this.options.now ?? (() => new Date()))());
      appendFileSync(join(this.options.logsDir, `escritorio-${stamp}.log`), clean);
    } catch {
      /* logging must never break the server */
    }
    if (this.options.echo) process.stdout.write(clean);
  }
}

/** Strips the query string: `/auth/callback?ticket=...` must never be logged with its ticket. */
export function pathOnly(url: string | undefined): string {
  if (!url) return '';
  const cut = url.indexOf('?');
  return cut === -1 ? url : url.slice(0, cut);
}

export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-escritorio-csrf"]',
  'res.headers["set-cookie"]',
  '*.token',
  '*.hookToken',
  '*.ticket',
  '*.csrfToken',
  '*.sid',
  '*.password',
];

export interface PinoOptionsInput {
  level: string;
  sink: LogSink;
}

/**
 * Options for Fastify's built-in pino logger (`fastify({ logger })`): redaction, request
 * serializers without headers/bodies/query, and the daily-file sink.
 */
export function createLoggerOptions({ level, sink }: PinoOptionsInput) {
  return {
    level,
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
    serializers: {
      req(request: { method?: string; url?: string }) {
        return { method: request.method, path: pathOnly(request.url) };
      },
      res(reply: { statusCode?: number }) {
        return { statusCode: reply.statusCode };
      },
    },
    stream: sink,
  };
}
