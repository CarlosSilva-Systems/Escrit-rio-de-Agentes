// Project name validation (ADR-0005, "DEV-root jail"). Pure: no I/O.
// The browser only ever sends a project *name*; the server resolves the path (PathJail).
// 8.3 aliases ("PROGRA~1") need no dedicated rule: "~" is not in the allowed character set.

export const PROJECT_NAME_MAX_LENGTH = 100;

const ALLOWED_CHARS = /^[\p{L}\p{N} ._()-]+$/u;
const RESERVED_DEVICE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

export type ProjectNameError =
  'empty' | 'too-long' | 'invalid-chars' | 'dot-or-space-edge' | 'dot-segment' | 'reserved-name';

export type ProjectNameResult = { ok: true; name: string } | { ok: false; error: ProjectNameError };

export function validateProjectName(input: unknown): ProjectNameResult {
  if (typeof input !== 'string' || input.length === 0) return { ok: false, error: 'empty' };
  if (input.length > PROJECT_NAME_MAX_LENGTH) return { ok: false, error: 'too-long' };
  if (input === '.' || input === '..') return { ok: false, error: 'dot-segment' };
  if (!ALLOWED_CHARS.test(input)) return { ok: false, error: 'invalid-chars' };
  if (/^[. ]|[. ]$/.test(input)) return { ok: false, error: 'dot-or-space-edge' };
  // Windows treats "CON.txt" as the device CON: compare the part before the first dot.
  const stem = (input.split('.')[0] ?? '').trim();
  if (RESERVED_DEVICE.test(stem)) return { ok: false, error: 'reserved-name' };
  return { ok: true, name: input };
}

export function isValidProjectName(input: unknown): input is string {
  return validateProjectName(input).ok;
}
