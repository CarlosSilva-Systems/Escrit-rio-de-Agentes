import { EscritorioSchema } from '../../shared/contracts';
import type { Escritorio, TeamView } from '../../shared/contracts';
import { diag } from './diagnostics';
import type { TeamDiagnostic } from './diagnostics';

// Validation of the escritorio.json text. Pure: no I/O. Never throws.

export const MAX_ESCRITORIO_BYTES = 1024 * 1024;
const MAX_ISSUES = 20;

export type EscritorioParse =
  | { ok: true; config: Escritorio; diagnostics: TeamDiagnostic[] }
  | { ok: false; diagnostics: TeamDiagnostic[] };

function classify(
  path: (string | number)[],
  message: string,
): { code: string; params?: Record<string, string> } {
  const dup = /^duplicate agentType "(.+)"$/.exec(message);
  if (dup) return { code: 'team.agent-duplicate', params: { agentType: dup[1] ?? '' } };
  const desk = /^desk "(.+)" assigned to more than one agent$/.exec(message);
  if (desk) return { code: 'team.desk-duplicate', params: { desk: desk[1] ?? '' } };
  const dept = /^unknown department "(.+)"$/.exec(message);
  if (dept) return { code: 'team.department-unknown', params: { department: dept[1] ?? '' } };
  if (/duplicate department id/.test(message)) return { code: 'team.department-duplicate' };
  if (/isLead/.test(message)) return { code: 'team.lead-count' };
  return { code: path.length > 0 ? 'team.field-invalid' : 'team.schema-invalid' };
}

/** `agents.3.desk` style path (zod issue path joined by dots). */
export function formatIssuePath(path: readonly PropertyKey[]): string {
  return path.map(String).join('.');
}

export function parseEscritorioText(text: string): EscritorioParse {
  if (text.length > MAX_ESCRITORIO_BYTES) {
    return {
      ok: false,
      diagnostics: [
        diag('team.file-too-large', 'escritorio.json', 'file is larger than 1 MiB', {
          severity: 'error',
        }),
      ],
    };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    // V8 messages may quote a fragment of the file: keep only the position hint.
    const m = e instanceof Error ? /position (\d+)/.exec(e.message) : null;
    return {
      ok: false,
      diagnostics: [
        diag(
          'team.json-invalid',
          'escritorio.json',
          `invalid JSON${m ? ` near position ${m[1]}` : ''}`,
          {
            severity: 'error',
            ...(m?.[1] ? { params: { position: m[1] } } : {}),
          },
        ),
      ],
    };
  }
  const parsed = EscritorioSchema.safeParse(raw);
  if (parsed.success) return { ok: true, config: parsed.data, diagnostics: [] };

  const diagnostics: TeamDiagnostic[] = parsed.error.issues.slice(0, MAX_ISSUES).map((issue) => {
    const path = formatIssuePath(issue.path);
    const { code, params } = classify(issue.path as (string | number)[], issue.message);
    return diag(code, 'escritorio.json', issue.message, {
      severity: 'error',
      ...(path ? { path } : {}),
      params: { ...params, ...(path ? { field: path } : {}) },
    });
  });
  if (parsed.error.issues.length > MAX_ISSUES) {
    diagnostics.push(
      diag(
        'team.more-issues',
        'escritorio.json',
        `${parsed.error.issues.length - MAX_ISSUES} more issues not shown`,
        {
          severity: 'error',
        },
      ),
    );
  }
  return { ok: false, diagnostics };
}

/** Public view of a valid config (the client needs personality/phrases for balloons). */
export function configToView(config: Escritorio): TeamView {
  return {
    source: 'escritorio',
    studio: config.studio,
    departments: config.departments,
    agents: config.agents,
    freelancer: config.freelancer,
    ...(config.mascots ? { mascots: config.mascots } : {}),
  };
}
