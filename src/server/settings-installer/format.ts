// Keeps the user's file formatting (BOM, line endings, indent, trailing newline) so an additive
// change touches only the lines we add (and `revert` can restore the original bytes).

export interface TextFormat {
  bom: boolean;
  eol: '\n' | '\r\n';
  /** `undefined` = minified. */
  indent: string | undefined;
  trailingNewline: boolean;
}

export const DEFAULT_FORMAT: TextFormat = {
  bom: false,
  eol: '\n',
  indent: '  ',
  trailingNewline: true,
};

export function detectFormat(text: string): TextFormat {
  const bom = text.charCodeAt(0) === 0xfeff;
  const body = bom ? text.slice(1) : text;
  const eol = body.includes('\r\n') ? '\r\n' : '\n';
  const trailingNewline = body.endsWith('\n');
  const lines = body.split(/\r?\n/).filter((l) => l !== '');
  let indent: string | undefined;
  if (lines.length > 1) {
    const first = lines.find((l) => /^[ \t]+\S/.test(l));
    indent = first ? (/^[ \t]+/.exec(first)?.[0] ?? '  ') : '  ';
  }
  return { bom, eol, indent, trailingNewline };
}

export function serialize(value: unknown, format: TextFormat): string {
  let text = JSON.stringify(value, null, format.indent);
  if (format.eol === '\r\n') text = text.replace(/\n/g, '\r\n');
  if (format.trailingNewline) text += format.eol;
  return (format.bom ? '\uFEFF' : '') + text;
}

export function parseSettingsText(
  text: string,
):
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; code: 'invalid-json' | 'not-object' } {
  let raw: unknown;
  try {
    raw = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  } catch {
    return { ok: false, code: 'invalid-json' };
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, code: 'not-object' };
  }
  return { ok: true, value: raw as Record<string, unknown> };
}

/** Deterministic JSON (sorted keys): used only to compare two documents. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}
