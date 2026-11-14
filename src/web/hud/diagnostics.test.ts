import { describe, expect, it } from 'vitest';
import type { Diagnostic } from '../../shared/contracts';
import { translate } from '../i18n/i18n';
import {
  classifyDiagnostics,
  describeNotice,
  DIAGNOSTIC_KEYS,
  noticeSignature,
} from './diagnostics';

const d = (
  file: string,
  code: string | undefined,
  extra: Partial<Diagnostic> = {},
): Diagnostic => ({
  file,
  message: 'raw English text from the server',
  severity: 'error',
  ...(code ? { code } : {}),
  ...extra,
});

const render = (n: Diagnostic, lang: 'pt-BR' | 'en' = 'pt-BR') => {
  const { warnings } = classifyDiagnostics([n]);
  const { key, params } = describeNotice(warnings[0] as NonNullable<(typeof warnings)[number]>);
  return translate(lang, key, params);
};

describe('diagnostic classification by code', () => {
  it('CA-13: a missing escritorio.json (code team.file-missing) is informative, not a warning', () => {
    expect(classifyDiagnostics([d('escritorio.json', 'team.file-missing')])).toEqual({
      missing: true,
      warnings: [],
    });
  });

  it('CA-13: info diagnostics (keeping-last-valid, using-quadro-fallback, watcher) are never warnings', () => {
    const info = [
      'team.keeping-last-valid',
      'team.using-quadro-fallback',
      'jsonl.watcher-inactive',
    ];
    expect(classifyDiagnostics(info.map((c) => d('x', c, { severity: 'info' })))).toEqual({
      missing: false,
      warnings: [],
    });
  });

  it('CA-13: every server code maps to a pt-BR and en sentence with no leftover placeholder or raw English', () => {
    const codes = Object.keys(DIAGNOSTIC_KEYS);
    expect(codes.length).toBeGreaterThanOrEqual(20);
    for (const code of codes) {
      const file = code.startsWith('quadro') ? 'QUADRO.md' : 'escritorio.json';
      for (const lang of ['pt-BR', 'en'] as const) {
        const text = render(d(file, code, { params: { field: 'agents' } }), lang);
        expect(text, `${code} ${lang}`).not.toMatch(/\{\w+\}/);
        expect(text).not.toContain('raw English');
        expect(text.length).toBeGreaterThan(10);
      }
    }
  });

  it('CA-13: validation failures say "keeping the last valid configuration" and name the file and field', () => {
    const t = render(
      d('escritorio.json', 'team.field-invalid', { path: 'agents', params: { field: 'agents' } }),
    );
    expect(t).toBe(
      'Problema em escritorio.json · agents: valor inválido. Mantendo a última configuração válida.',
    );
    expect(render(d('escritorio.json', 'team.json-invalid'))).toContain(
      'Mantendo a última configuração válida',
    );
    expect(render(d('escritorio.json', 'team.json-invalid'), 'en')).toContain(
      'Keeping the last valid configuration',
    );
  });

  it('CA-13: params fill the sentence (agent, desk, department, dropped Freelancers)', () => {
    expect(
      render(d('escritorio.json', 'team.agent-duplicate', { params: { agentType: 'dev-web' } })),
    ).toContain('dev-web');
    expect(
      render(d('escritorio.json', 'team.desk-duplicate', { params: { desk: 'ENG-01' } })),
    ).toContain('ENG-01');
    expect(
      render(d('escritorio.json', 'team.department-unknown', { params: { department: 'x9' } })),
    ).toContain('x9');
    expect(
      render(d('office', 'office.freelancer-limit', { params: { dropped: '42' } }), 'en'),
    ).toContain('42');
  });

  it('CA-13: an unknown code or no code falls back to a generic notice, never the raw message', () => {
    const t = render(d('algo.json', 'future.new-code'));
    expect(t).toBe('Aviso sobre algo.json. Detalhes no log do servidor.');
    expect(render(d('QUADRO.md', undefined))).toContain('Aviso sobre QUADRO.md');
  });

  it('CA-13: untrusted params are shown as plain text values (no markup interpretation by the formatter)', () => {
    const t = render(
      d('escritorio.json', 'team.agent-duplicate', {
        params: { agentType: '<img src=x onerror=1>' },
      }),
    );
    expect(t).toContain('<img src=x onerror=1>'); // React escapes it when rendered
  });

  it('CA-13: the signature changes with codes and params (a dismissed strip returns for new problems)', () => {
    const a = classifyDiagnostics([
      d('escritorio.json', 'team.field-invalid', { params: { field: 'a' } }),
    ]);
    const b = classifyDiagnostics([
      d('escritorio.json', 'team.field-invalid', { params: { field: 'b' } }),
    ]);
    expect(noticeSignature(false, a.warnings)).not.toBe(noticeSignature(false, b.warnings));
    expect(noticeSignature(true, [])).not.toBe(noticeSignature(false, []));
  });
});
