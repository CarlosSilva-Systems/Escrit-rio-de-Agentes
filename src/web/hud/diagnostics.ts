// Turns server diagnostics into UI notices. The server sends a stable `code` plus short `params`
// (field, id, position: UNTRUSTED text, shown escaped by React); each code maps to an i18n sentence.
// The English `message` is never shown, not even for unknown codes (generic notice instead).

import type { Diagnostic } from '../../shared/contracts';
import type { MessageKey, Params } from '../i18n/i18n';

/** code -> i18n key. Several consistency codes share one sentence. */
export const DIAGNOSTIC_KEYS: Readonly<Record<string, MessageKey>> = {
  'team.json-invalid': 'diag.code.team.json-invalid',
  'team.field-invalid': 'diag.code.team.field-invalid',
  'team.schema-invalid': 'diag.code.team.schema-invalid',
  'team.file-too-large': 'diag.code.team.file-too-large',
  'team.agent-duplicate': 'diag.code.team.agent-duplicate',
  'team.desk-duplicate': 'diag.code.team.desk-duplicate',
  'team.department-unknown': 'diag.code.team.department-unknown',
  'team.department-duplicate': 'diag.code.team.department-duplicate',
  'team.lead-count': 'diag.code.team.lead-count',
  'team.desk-missing-in-map': 'diag.code.team.desk-missing-in-map',
  'team.desk-wrong-room': 'diag.code.team.desk-wrong-room',
  'team.room-missing-in-map': 'diag.code.team.room-missing-in-map',
  'team.npc-without-agent': 'diag.code.team.consistency',
  'team.agent-without-npc': 'diag.code.team.consistency',
  'team.desk-null-not-provisional': 'diag.code.team.consistency',
  'team.more-issues': 'diag.code.team.consistency',
  'quadro.file-missing': 'diag.code.quadro.file-missing',
  'quadro.no-agents': 'diag.code.quadro.no-agents',
  'quadro.row-invalid': 'diag.code.quadro.row-invalid',
  'quadro.agent-duplicate': 'diag.code.quadro.agent-duplicate',
  'quadro.too-many': 'diag.code.quadro.too-many',
  'map.unreadable': 'diag.code.map.unreadable',
  'office.freelancer-limit': 'diag.code.office.freelancer-limit',
};

/** The one informative case: the team file does not exist yet (reserve team in use). */
export const TEAM_FILE_MISSING = 'team.file-missing';

export interface DiagNotice {
  code?: string;
  file: string;
  path?: string;
  params: Record<string, string>;
}

/** Splits diagnostics into the informative "team file missing" note and real warnings. */
export function classifyDiagnostics(diagnostics: readonly Diagnostic[] | undefined): {
  missing: boolean;
  warnings: DiagNotice[];
} {
  let missing = false;
  const warnings: DiagNotice[] = [];
  for (const d of diagnostics ?? []) {
    if (d.severity === 'info') continue;
    if (d.code === TEAM_FILE_MISSING) {
      missing = true;
      continue;
    }
    warnings.push({
      ...(d.code ? { code: d.code } : {}),
      file: d.file,
      ...(d.path ? { path: d.path } : {}),
      params: d.params ?? {},
    });
  }
  return { missing, warnings };
}

/** i18n key and parameters for one notice (every placeholder is filled, never left as `{x}`). */
export function describeNotice(n: DiagNotice): { key: MessageKey; params: Params } {
  const key = (n.code && DIAGNOSTIC_KEYS[n.code]) || 'diag.generic';
  const field = n.path ?? n.params.field;
  return {
    key,
    params: {
      agentType: '',
      desk: '',
      department: '',
      position: '',
      dropped: '',
      ...n.params,
      arquivo: n.file,
      campo: field ? ` · ${field}` : '',
    },
  };
}

/** Changes when the set of notices changes, so a dismissed strip comes back for NEW problems. */
export function noticeSignature(missing: boolean, warnings: readonly DiagNotice[]): string {
  return `${missing ? 'M' : ''}|${warnings.map((w) => `${w.code ?? ''}:${w.file}:${w.path ?? ''}:${JSON.stringify(w.params)}`).join(',')}`;
}
