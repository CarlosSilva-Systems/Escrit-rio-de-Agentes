// Minimal masking for the few free-text fields the office keeps (task subject, <=120 chars).
// Hook payloads are otherwise reduced to names and ids; this is a second safety net, not a
// license to keep content. (A complete masker for approval summaries belongs to T-46.)

const PATTERNS: readonly RegExp[] = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi,
  /\b(?:sk|pk|rk|ghp|gho|ghs|github_pat|xox[abprs]|AKIA|AIza)[A-Za-z0-9_-]{12,}/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/g,
  /\b(?:password|passwd|senha|secret|token|api[_-]?key|authorization)\s*[=:]\s*\S+/gi,
  /\b[A-Za-z0-9+/_-]{32,}={0,2}/g,
];

export function maskSecrets(text: string): string {
  let out = text;
  for (const pattern of PATTERNS) out = out.replace(pattern, '***');
  return out;
}

/** One-line, masked, bounded text; `undefined` when the value is not a non-empty string. */
export function safeSubject(value: unknown, max = 120): string | undefined {
  if (typeof value !== 'string') return undefined;
  const oneLine = maskSecrets(value.replace(/\s+/g, ' ').trim());
  if (oneLine === '') return undefined;
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine;
}

const PLAN_TASK_REF = /\bT-\d{1,3}[a-z]?\b/;

/** "T-12" when the text mentions a plan task id. */
export function extractTaskRef(...candidates: unknown[]): string | undefined {
  for (const c of candidates) {
    if (typeof c !== 'string') continue;
    const m = PLAN_TASK_REF.exec(c);
    if (m) return m[0];
  }
  return undefined;
}
