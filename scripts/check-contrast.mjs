// WCAG 2.x contrast audit of the HUD palette (CA-24). Plain Node, no dependencies.
//
// Reads the colour tokens of `docs/design/tokens.css` (source of truth) and `src/web/styles/tokens.css`
// (the copy the app ships), computes the contrast ratio of every text/background pair documented in
// `docs/design/GUIA-VISUAL.md` section 4 and compares it with the numbers Bianca calculated by hand
// (difference > 0.05 = divergence). It also scans `src/web/styles/app.css` for rules that set both
// `color` and `background` with tokens, and checks the two token files agree value by value.
//
// Minimums: text 4.5:1, UI / icons / focus 3:1.   Usage: `node scripts/check-contrast.mjs [--json]`
// Exit code 1 when a pair fails its minimum, a documented number diverges, or the token files differ.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const DOCS_TOKENS = join(ROOT, 'docs', 'design', 'tokens.css');
export const WEB_TOKENS = join(ROOT, 'src', 'web', 'styles', 'tokens.css');
export const APP_CSS = join(ROOT, 'src', 'web', 'styles', 'app.css');

export const MIN_TEXT = 4.5;
export const MIN_UI = 3;
export const DIVERGENCE = 0.05;

/** `--name: #abc123;` declarations of a CSS text (first definition wins, comments ignored). */
export function parseTokens(css) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const tokens = {};
  for (const m of clean.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    const name = m[1];
    if (name && tokens[name] === undefined) tokens[name] = (m[2] ?? '').trim().toLowerCase();
  }
  return tokens;
}

export function hexToRgb(hex) {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`not a hex colour: ${hex}`);
  let h = m[1];
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

export function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(fg, bg) {
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const DEPTS = ['diretoria', 'planejamento', 'engenharia', 'qualidade', 'entrega', 'biblioteca'];
const SURFACES = ['bg-900', 'bg-800', 'bg-700'];

/**
 * Documented pairs: [id, section, foreground token, background token, hand-calculated ratio, minimum].
 * Hand numbers are copied from GUIA-VISUAL.md section 4 (4.1 text, 4.2 coloured fills, 4.3 UI).
 */
export function documentedPairs() {
  const pairs = [];
  const add = (section, fg, bg, doc, min) =>
    pairs.push({ id: `${section} ${fg} on ${bg}`, section, fg, bg, doc, min });

  // 4.1 text on HUD surfaces (columns: bg-900 / bg-800 / bg-700)
  const t41 = {
    'text-1': [14.65, 13.13, 10.78],
    'text-2': [10.04, 9.0, 7.39],
    'text-3': [6.93, 6.21, 5.1],
    'teal-300': [8.64, 7.75, 6.36],
    'terra-300': [6.74, 6.04, 4.96],
    'danger-text': [6.57, 5.88, 4.83],
    'meter-yellow': [10.86, 9.73, 7.99],
    'meter-green': [8.41, 7.54, 6.19],
    'dept-diretoria-light': [9.89, 8.86, 7.28],
    'dept-planejamento-light': [7.89, 7.07, 5.8],
    'dept-engenharia-light': [7.65, 6.86, 5.63],
    'dept-qualidade-light': [8.94, 8.01, 6.58],
    'dept-entrega-light': [8.15, 7.3, 6.0],
    'dept-biblioteca-light': [6.98, 6.26, 5.14],
  };
  for (const [fg, values] of Object.entries(t41)) {
    SURFACES.forEach((bg, i) => add('4.1', fg, bg, values[i], MIN_TEXT));
  }

  // 4.2 text on coloured fills
  const t42 = [
    ['ink', 'teal-300', 8.64],
    ['ink', 'terra-300', 6.74],
    ['ink', 'meter-red', 5.66],
    ['ink', 'meter-yellow', 10.86],
    ['ink', 'meter-green', 8.41],
    ['ink', 'dept-diretoria-light', 9.89],
    ['ink', 'dept-planejamento-light', 7.89],
    ['ink', 'dept-engenharia-light', 7.65],
    ['ink', 'dept-qualidade-light', 8.94],
    ['ink', 'dept-entrega-light', 8.15],
    ['ink', 'dept-biblioteca-light', 6.98],
    ['ink', 'dept-diretoria-base', 6.47],
    ['ink', 'dept-planejamento-base', 5.15],
    ['ink', 'dept-engenharia-base', 5.54],
    ['ink', 'dept-qualidade-base', 4.95],
    ['ink', 'dept-entrega-base', 5.7],
    ['text-1', 'dept-biblioteca-base', 6.71],
    ['ink', 'text-1', 14.65],
  ];
  for (const [fg, bg, doc] of t42) add('4.2', fg, bg, doc, MIN_TEXT);

  // 4.3 UI, icons, focus (3:1)
  [4.57, 4.1, 3.37].forEach((v, i) => add('4.3', 'border-strong', SURFACES[i], v, MIN_UI));
  [
    ['meter-green', 7.54, 9.32],
    ['meter-yellow', 9.73, 12.03],
    ['meter-red', 5.08, 6.28],
  ].forEach(([fg, onSurface, onTrack]) => {
    add('4.3', fg, 'bg-800', onSurface, MIN_UI);
    add('4.3', fg, 'bg-track', onTrack, MIN_UI);
  });
  [12.46, 11.17, 9.17].forEach((v, i) => add('4.3', 'focus', SURFACES[i], v, MIN_UI));
  add('4.3', 'text-disabled', 'bg-800', 3.61, MIN_UI); // exempt (inactive component), kept >= 3
  return pairs;
}

/** Notes of the guide that are deliberately NOT usable pairs (documented negatives). */
export const DOCUMENTED_NEGATIVES = [
  {
    fg: 'meter-red',
    bg: 'bg-700',
    doc: 4.17,
    note: 'meter-red is fill/border only; text uses danger-text (4.1)',
  },
];

/** Compares documented pairs with the tokens. `tokens` is a name -> hex map. */
export function auditPairs(tokens, pairs = documentedPairs()) {
  return pairs.map((p) => {
    const fg = tokens[p.fg];
    const bg = tokens[p.bg];
    if (!fg || !bg) {
      return {
        ...p,
        fgHex: fg,
        bgHex: bg,
        ratio: NaN,
        delta: NaN,
        passes: false,
        diverges: true,
        missing: true,
      };
    }
    const ratio = contrastRatio(fg, bg);
    const delta = Math.abs(ratio - p.doc);
    return {
      ...p,
      fgHex: fg,
      bgHex: bg,
      ratio,
      delta,
      passes: ratio >= p.min,
      diverges: delta > DIVERGENCE,
      missing: false,
    };
  });
}

/** Names whose values differ between two token maps (only colour-looking values, hex or rgba). */
export function tokenMismatches(a, b) {
  const norm = (v) => v.replace(/\s+/g, '').toLowerCase();
  const out = [];
  for (const name of Object.keys(a)) {
    if (!/^(#|rgba?\()/.test(a[name])) continue;
    if (b[name] === undefined) out.push({ name, docs: a[name], web: '(missing)' });
    else if (norm(a[name]) !== norm(b[name])) out.push({ name, docs: a[name], web: b[name] });
  }
  return out;
}

/** Rules of `app.css` that set a text colour with a token, optionally with a background token. */
export function scanCssUsage(css, tokens) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rows = [];
  for (const m of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = (m[1] ?? '').trim().replace(/\s+/g, ' ');
    const body = m[2] ?? '';
    const color = [...body.matchAll(/(?:^|[;\s])color\s*:\s*var\(--([a-z0-9-]+)\)/g)].pop()?.[1];
    const bg = [...body.matchAll(/background(?:-color)?\s*:\s*var\(--([a-z0-9-]+)\)/g)].pop()?.[1];
    if (!color) continue;
    const fgHex = tokens[color];
    if (!fgHex || !fgHex.startsWith('#')) continue;
    const exempt = color === 'text-disabled';
    const bgs = bg && tokens[bg]?.startsWith('#') ? [bg] : SURFACES;
    const ratios = bgs.map((b) => contrastRatio(fgHex, tokens[b]));
    const worst = Math.min(...ratios);
    rows.push({
      selector,
      fg: color,
      bg: bg && tokens[bg]?.startsWith('#') ? bg : 'surfaces',
      worst,
      exempt,
      passes: exempt || worst >= MIN_TEXT,
    });
  }
  return rows;
}

const fmt = (n) => (Number.isNaN(n) ? '  n/a' : n.toFixed(2).padStart(5));

export function runAudit(read = (p) => readFileSync(p, 'utf8')) {
  const docsTokens = parseTokens(read(DOCS_TOKENS));
  const webTokens = parseTokens(read(WEB_TOKENS));
  const audit = auditPairs(docsTokens);
  const mismatches = tokenMismatches(docsTokens, webTokens);
  const usage = scanCssUsage(read(APP_CSS), webTokens);
  const failing = audit.filter((r) => !r.passes);
  const diverging = audit.filter((r) => r.diverges);
  const usageFailing = usage.filter((r) => !r.passes);
  const departmentsCovered = DEPTS.every(
    (d) => docsTokens[`dept-${d}-light`] && docsTokens[`dept-${d}-base`],
  );
  return { audit, failing, diverging, mismatches, usage, usageFailing, departmentsCovered };
}

function main() {
  const json = process.argv.includes('--json');
  const r = runAudit();
  if (json) {
    console.log(JSON.stringify(r, null, 2));
  } else {
    console.log('WCAG contrast audit (tokens x GUIA-VISUAL section 4)\n');
    console.log(
      'sec  pair                                          script  doc    delta  min   status',
    );
    for (const p of r.audit) {
      const status = p.missing ? 'MISSING' : !p.passes ? 'FAIL' : p.diverges ? 'DIVERGES' : 'ok';
      console.log(
        `${p.section}  ${`${p.fg} on ${p.bg}`.padEnd(44)} ${fmt(p.ratio)}  ${fmt(p.doc)}  ${fmt(p.delta)}  ${p.min}   ${status}`,
      );
    }
    console.log(
      `\nDocumented negatives: ${DOCUMENTED_NEGATIVES.map((n) => `${n.fg} on ${n.bg} (${n.doc})`).join('; ')}`,
    );
    console.log(
      `\napp.css rules checked: ${r.usage.length}, below 4.5:1: ${r.usageFailing.length}`,
    );
    for (const u of r.usageFailing)
      console.log(`  FAIL ${u.selector}  ${u.fg} on ${u.bg} = ${fmt(u.worst)}`);
    console.log(`Token files out of sync: ${r.mismatches.length}`);
    for (const m of r.mismatches) console.log(`  ${m.name}: docs=${m.docs} web=${m.web}`);
    console.log(
      `\nPairs: ${r.audit.length} | fail minimum: ${r.failing.length} | diverge > ${DIVERGENCE}: ${r.diverging.length}`,
    );
  }
  const bad = r.failing.length + r.diverging.length + r.usageFailing.length + r.mismatches.length;
  process.exitCode = bad === 0 && r.departmentsCovered ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
