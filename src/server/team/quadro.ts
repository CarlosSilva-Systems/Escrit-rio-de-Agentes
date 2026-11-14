import { slug } from '../../shared/contracts';
import { diag } from './diagnostics';
import type { TeamDiagnostic } from './diagnostics';

// Tolerant reader of ~/.claude/equipe/QUADRO.md ("Equipe ativa" table). Never throws.
// Pure: receives the markdown text.

export interface QuadroAgent {
  agentType: string;
  nickname: string;
  /** Raw "Fase" cell (Planejar, Construir, Qualidade, Entregar, Apoio, Todas). */
  phase: string;
  /** Raw "Função" cell. */
  role: string;
}

export interface QuadroResult {
  agents: QuadroAgent[];
  diagnostics: TeamDiagnostic[];
}

const MAX_AGENTS = 200;

function splitRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((c) => c.trim());
}

const isSeparator = (cells: string[]) =>
  cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c));

/** Normalizes a header cell: lowercase, no accents. */
export function foldText(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}

export function parseQuadro(markdown: string): QuadroResult {
  const diagnostics: TeamDiagnostic[] = [];
  const agents: QuadroAgent[] = [];
  const lines = markdown.split(/\r?\n/);

  // Prefer the table under "## Equipe ativa"; otherwise the first table whose header starts
  // with "Agente".
  let start = lines.findIndex((l) => /^#{1,6}\s*equipe\s+ativa\b/i.test(foldText(l)));
  if (start < 0) start = 0;

  let columns: { agent: number; nickname: number; phase: number; role: number } | null = null;
  const seen = new Set<string>();
  let inTable = false;

  for (let i = start; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (/^#{1,6}\s/.test(line) && i > start && (columns !== null || inTable)) break;
    if (!line.trim().startsWith('|')) {
      if (columns !== null && line.trim() === '') break; // blank line ends the table
      continue;
    }
    const cells = splitRow(line);
    if (columns === null) {
      const folded = cells.map(foldText);
      if (folded[0]?.startsWith('agente')) {
        const idx = (names: string[]) =>
          folded.findIndex((c) => names.some((n) => c.startsWith(n)));
        columns = {
          agent: 0,
          nickname: Math.max(idx(['apelido']), 1),
          phase: idx(['fase']),
          role: idx(['funcao', 'função']),
        };
        inTable = true;
      }
      continue;
    }
    if (isSeparator(cells)) continue;
    // "chefe" may be wrapped in backticks or bold in hand-edited files.
    const rawType = (cells[columns.agent] ?? '').replace(/[`*_]/g, '').trim();
    if (!slug.safeParse(rawType).success) {
      diagnostics.push(
        diag('quadro.row-invalid', 'QUADRO.md', `row ignored: invalid agent name`, {
          path: `line ${i + 1}`,
        }),
      );
      continue;
    }
    if (seen.has(rawType)) {
      diagnostics.push(
        diag('quadro.agent-duplicate', 'QUADRO.md', `duplicate agent "${rawType}"`, {
          path: `line ${i + 1}`,
          params: { agentType: rawType },
        }),
      );
      continue;
    }
    if (agents.length >= MAX_AGENTS) {
      diagnostics.push(diag('quadro.too-many', 'QUADRO.md', `more than ${MAX_AGENTS} agents`));
      break;
    }
    seen.add(rawType);
    const cell = (idx: number) => (idx >= 0 ? (cells[idx] ?? '') : '');
    agents.push({
      agentType: rawType,
      nickname: cell(columns.nickname).replace(/[`*_]/g, '').trim() || rawType,
      phase: cell(columns.phase),
      role: cell(columns.role),
    });
  }

  if (agents.length === 0) {
    diagnostics.push(
      diag('quadro.no-agents', 'QUADRO.md', 'no agent rows found in the "Equipe ativa" table', {
        severity: 'error',
      }),
    );
  }
  return { agents, diagnostics };
}
