import { describe, expect, it } from 'vitest';
import {
  APP_CSS,
  DIVERGENCE,
  DOCUMENTED_NEGATIVES,
  MIN_TEXT,
  auditPairs,
  contrastRatio,
  documentedPairs,
  hexToRgb,
  parseTokens,
  runAudit,
  scanCssUsage,
  tokenMismatches,
} from '../../../scripts/check-contrast.mjs';
import { readFileSync } from 'node:fs';

const report = runAudit();

describe('CA-24: WCAG contrast of the HUD palette (scripts/check-contrast.mjs)', () => {
  it('CA-24: the formula matches known WCAG values (black/white = 21, same colour = 1)', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5);
    expect(contrastRatio('#fff', '#000')).toBeCloseTo(21, 5); // 3-digit hex
    expect(hexToRgb('#1F1A17')).toEqual([31, 26, 23]);
    expect(() => hexToRgb('rgb(1,2,3)')).toThrow();
  });

  it('CA-24: every documented text pair (GUIA-VISUAL 4.1/4.2) is at least 4.5:1', () => {
    const text = report.audit.filter((p) => p.min === MIN_TEXT);
    expect(text.length).toBeGreaterThanOrEqual(50);
    expect(text.filter((p) => !p.passes).map((p) => p.id)).toEqual([]);
  });

  it('CA-24: every UI / focus pair (GUIA-VISUAL 4.3) is at least 3:1', () => {
    const ui = report.audit.filter((p) => p.min === 3);
    expect(ui.length).toBeGreaterThanOrEqual(10);
    expect(ui.filter((p) => !p.passes).map((p) => p.id)).toEqual([]);
  });

  it("CA-24: Bianca's hand-calculated numbers agree with the script within 0.05", () => {
    expect(report.diverging.map((p) => `${p.id}: ${p.ratio.toFixed(2)} vs ${p.doc}`)).toEqual([]);
    expect(report.audit.every((p) => p.delta <= DIVERGENCE)).toBe(true);
  });

  it('CA-24: all 6 department colours are covered (light for badges, base for door signs)', () => {
    expect(report.departmentsCovered).toBe(true);
    const ids = report.audit.map((p) => p.id).join('\n');
    for (const d of [
      'diretoria',
      'planejamento',
      'engenharia',
      'qualidade',
      'entrega',
      'biblioteca',
    ]) {
      expect(ids).toContain(`dept-${d}-light`);
      expect(ids).toContain(`dept-${d}-base`);
    }
  });

  it('CA-24: docs/design/tokens.css and src/web/styles/tokens.css have the same colour values', () => {
    expect(report.mismatches).toEqual([]);
  });

  it('CA-24: the documented negative holds (meter-red as text on bg-700 would fail) and the app does not use it', () => {
    const tokens = parseTokens(readFileSync(APP_CSS.replace('app.css', 'tokens.css'), 'utf8'));
    for (const n of DOCUMENTED_NEGATIVES) {
      const ratio = contrastRatio(tokens[n.fg]!, tokens[n.bg]!);
      expect(ratio).toBeLessThan(MIN_TEXT);
      expect(Math.abs(ratio - n.doc)).toBeLessThanOrEqual(DIVERGENCE);
    }
    const usesRedText = report.usage.some((u) => u.fg === 'meter-red');
    expect(usesRedText).toBe(false);
  });

  it('CA-24: every `color: var(--token)` rule of app.css reaches 4.5:1 on its background (or on the worst HUD surface)', () => {
    expect(report.usage.length).toBeGreaterThan(5);
    expect(
      report.usageFailing.map((u) => `${u.selector}: ${u.fg} on ${u.bg} ${u.worst.toFixed(2)}`),
    ).toEqual([]);
  });

  it('CA-24: the checker really detects a failing pair, a divergence and a missing token (no false green)', () => {
    const tokens = { 'text-1': '#777777', 'bg-900': '#808080' };
    const rows = auditPairs(tokens, [
      { id: 'x', section: '4.1', fg: 'text-1', bg: 'bg-900', doc: 14.65, min: 4.5 },
      { id: 'y', section: '4.1', fg: 'text-1', bg: 'nope', doc: 3, min: 4.5 },
    ]);
    expect(rows[0]!.passes).toBe(false);
    expect(rows[0]!.diverges).toBe(true);
    expect(rows[1]!.missing).toBe(true);
    expect(rows[1]!.passes).toBe(false);
    const css = '.a { color: var(--text-1); background: var(--bg-900); }';
    expect(scanCssUsage(css, tokens)[0]!.passes).toBe(false);
    expect(tokenMismatches({ 'bg-900': '#111111' }, { 'bg-900': '#222222' })).toHaveLength(1);
    expect(tokenMismatches({ 'bg-900': '#111111' }, { 'bg-900': '#111111' })).toHaveLength(0);
  });

  it('CA-24: the guide lists pairs only from tokens that exist (no pair is silently skipped)', () => {
    const tokens = parseTokens(readFileSync(APP_CSS.replace('app.css', 'tokens.css'), 'utf8'));
    for (const p of documentedPairs()) {
      expect(tokens[p.fg], p.id).toBeDefined();
      expect(tokens[p.bg], p.id).toBeDefined();
    }
  });
});
