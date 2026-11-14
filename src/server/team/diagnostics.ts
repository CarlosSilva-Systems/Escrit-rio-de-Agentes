import type { Diagnostic } from '../../shared/contracts';

/**
 * Team diagnostic: the public `Diagnostic` contract plus a stable `code` (and optional params)
 * so the UI/CLI can render the message through i18n. `message` is a short technical English
 * detail and never contains file contents beyond field names.
 */
export interface TeamDiagnostic extends Diagnostic {
  code: string;
  params?: Record<string, string>;
}

export type TeamFile = 'escritorio.json' | 'QUADRO.md' | 'mapa.json';

export function diag(
  code: string,
  file: TeamFile,
  message: string,
  opts: {
    path?: string;
    severity?: Diagnostic['severity'];
    params?: Record<string, string>;
  } = {},
): TeamDiagnostic {
  const out: TeamDiagnostic = {
    code,
    file,
    message: message.slice(0, 300),
    severity: opts.severity ?? 'warning',
  };
  if (opts.path !== undefined) out.path = opts.path.slice(0, 200);
  if (opts.params !== undefined) out.params = opts.params;
  return out;
}

/** Strip the extra fields so the result satisfies the public `Diagnostic` schema. */
export function toPublicDiagnostic(d: TeamDiagnostic): Diagnostic {
  const out: Diagnostic = {
    file: d.file,
    message: d.message,
    severity: d.severity,
    code: d.code.slice(0, 64),
  };
  if (d.path !== undefined) out.path = d.path;
  if (d.params !== undefined) {
    // Bounded plain strings only: the diagnostic must never carry file content.
    out.params = Object.fromEntries(
      Object.entries(d.params)
        .slice(0, 8)
        .map(([k, v]) => [k.slice(0, 40), String(v).slice(0, 100)]),
    );
  }
  return out;
}
