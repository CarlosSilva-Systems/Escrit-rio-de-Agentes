// Small unified-diff generator (LCS on lines). Settings files are tiny, so O(n*m) is fine; a hard
// size cap keeps it safe if someone points it at a huge file.

const MAX_LINES = 5000;

type Op = { t: ' ' | '-' | '+'; line: string };

function lines(text: string): string[] {
  const body = text.replace(/^\uFEFF/, '');
  if (body === '') return [];
  const parts = body.split(/\r?\n/);
  if (parts.at(-1) === '') parts.pop();
  return parts;
}

function diffOps(a: string[], b: string[]): Op[] {
  const n = a.length;
  const m = b.length;
  const width = m + 1;
  const lcs = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i * width + j] =
        a[i] === b[j]
          ? (lcs[(i + 1) * width + j + 1] ?? 0) + 1
          : Math.max(lcs[(i + 1) * width + j] ?? 0, lcs[i * width + j + 1] ?? 0);
    }
  }
  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ t: ' ', line: a[i] as string });
      i++;
      j++;
    } else if ((lcs[(i + 1) * width + j] ?? 0) >= (lcs[i * width + j + 1] ?? 0)) {
      ops.push({ t: '-', line: a[i++] as string });
    } else {
      ops.push({ t: '+', line: b[j++] as string });
    }
  }
  while (i < n) ops.push({ t: '-', line: a[i++] as string });
  while (j < m) ops.push({ t: '+', line: b[j++] as string });
  return ops;
}

export interface UnifiedDiffOptions {
  fromLabel: string;
  toLabel: string;
  context?: number;
}

/** Unified diff, or `''` when the texts are identical (or too large to compare). */
export function unifiedDiff(before: string, after: string, options: UnifiedDiffOptions): string {
  if (before === after) return '';
  const a = lines(before);
  const b = lines(after);
  if (a.length > MAX_LINES || b.length > MAX_LINES) return '';
  const ops = diffOps(a, b);
  const context = options.context ?? 3;

  const changed = ops.flatMap((op, i) => (op.t === ' ' ? [] : [i]));
  if (changed.length === 0) return '';
  const hunks: Array<[number, number]> = [];
  for (const idx of changed) {
    const start = Math.max(0, idx - context);
    const end = Math.min(ops.length, idx + context + 1);
    const last = hunks.at(-1);
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else hunks.push([start, end]);
  }

  const out = [`--- ${options.fromLabel}`, `+++ ${options.toLabel}`];
  for (const [start, end] of hunks) {
    let aStart = 1;
    let bStart = 1;
    for (let i = 0; i < start; i++) {
      if (ops[i]?.t !== '+') aStart++;
      if (ops[i]?.t !== '-') bStart++;
    }
    const slice = ops.slice(start, end);
    const aCount = slice.filter((o) => o.t !== '+').length;
    const bCount = slice.filter((o) => o.t !== '-').length;
    out.push(
      `@@ -${aCount === 0 ? aStart - 1 : aStart},${aCount} +${bCount === 0 ? bStart - 1 : bStart},${bCount} @@`,
    );
    for (const op of slice) out.push(`${op.t}${op.line}`);
  }
  return `${out.join('\n')}\n`;
}
