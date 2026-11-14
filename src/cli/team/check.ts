import { checkConsistency, parseMapIndex } from '../../server/team/consistency';
import type { TeamDiagnostic } from '../../server/team/diagnostics';
import { parseQuadro } from '../../server/team/quadro';
import { parseEscritorioText } from '../../server/team/validate';
import { tr } from './messages';
import type { CliLang } from './messages';

// `team:check`: QUADRO.md x escritorio.json x mapa.json. READ-ONLY: never writes anything.
// Exit codes: 0 consistent · 1 inconsistencies found · 2 could not run (missing input/usage).

export interface CliIo {
  out(line: string): void;
  err(line: string): void;
  /** Text of the file, or null when it does not exist. */
  readText(path: string): Promise<string | null>;
}

export interface TeamCheckOptions {
  quadroPath: string;
  escritorioPath: string;
  /** null = skip the map checks. */
  mapPath: string | null;
  /** true when the user passed --mapa explicitly (a missing file is then an error). */
  mapExplicit: boolean;
  lang: CliLang;
}

export function renderDiagnostic(lang: CliLang, d: TeamDiagnostic): string {
  const params: Record<string, string> = { ...d.params, detail: d.message };
  if (d.code === 'team.json-invalid')
    params.position = d.params?.position ? ` (${d.params.position})` : '';
  const key = `diag.${d.code}`;
  const text = tr(lang, key, params);
  const message = text === key ? d.message : text;
  const where = d.path ? `${d.file} ${d.path}` : d.file;
  return `${tr(lang, `severity.${d.severity}`).padEnd(7)} ${where}: ${message}`;
}

export async function runTeamCheck(opts: TeamCheckOptions, io: CliIo): Promise<number> {
  const { lang } = opts;
  io.out(tr(lang, 'check.title'));

  const quadroText = await io.readText(opts.quadroPath);
  if (quadroText === null) {
    io.err(tr(lang, 'check.quadro-missing', { path: opts.quadroPath }));
    return 2;
  }
  const escritorioText = await io.readText(opts.escritorioPath);
  if (escritorioText === null) {
    io.err(tr(lang, 'check.escritorio-missing', { path: opts.escritorioPath }));
    return 2;
  }

  const findings: TeamDiagnostic[] = [];
  const quadro = parseQuadro(quadroText);
  findings.push(...quadro.diagnostics);

  let map = null;
  let mapLabel = tr(lang, 'unavailable');
  if (opts.mapPath !== null) {
    const mapText = await io.readText(opts.mapPath);
    if (mapText === null) {
      if (opts.mapExplicit) {
        io.err(tr(lang, 'check.map-missing', { path: opts.mapPath }));
        return 2;
      }
      io.out(tr(lang, 'check.map-skipped', { path: opts.mapPath }));
    } else {
      try {
        map = parseMapIndex(JSON.parse(mapText));
      } catch {
        map = null;
      }
      if (map === null) {
        io.err(tr(lang, 'check.map-unreadable', { path: opts.mapPath }));
        return 2;
      }
      mapLabel = opts.mapPath;
    }
  }
  io.out(
    tr(lang, 'check.files', {
      quadro: opts.quadroPath,
      escritorio: opts.escritorioPath,
      mapa: mapLabel,
    }),
  );

  const parsed = parseEscritorioText(escritorioText);
  let npcs = 0;
  if (parsed.ok) {
    npcs = parsed.config.agents.length;
    findings.push(...checkConsistency({ quadro: quadro.agents, escritorio: parsed.config, map }));
  } else {
    findings.push(...parsed.diagnostics);
  }

  io.out(tr(lang, 'check.counts', { quadro: quadro.agents.length, npcs }));
  const errors = findings.filter((f) => f.severity === 'error').length;
  const warnings = findings.filter((f) => f.severity === 'warning').length;
  for (const f of findings) io.out(renderDiagnostic(lang, f));
  if (errors > 0 || warnings > 0) {
    io.out(tr(lang, 'check.fail', { errors, warnings }));
    return 1;
  }
  io.out(tr(lang, 'check.ok'));
  return 0;
}
