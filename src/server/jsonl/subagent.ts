// Subagent files (S-05, CA-18): `<project-slug>/<sessionId>/subagents/agent-<id>.jsonl` plus
// `agent-<id>.meta.json` (and an ignorable `agent-<id>.prefix.json`). Pure; never throws.
// PRIVACY: the meta's `description` (a task summary) is deliberately NOT extracted.

export type SubagentFileKind = 'transcript' | 'meta' | 'prefix';

export interface SubagentPath {
  kind: SubagentFileKind;
  agentId: string;
  /** Session folder name = parent session id. */
  sessionId: string;
  /** Project folder slug under ~/.claude/projects (only when the path includes it). */
  projectSlug?: string;
}

const FILE_RE = /^agent-([A-Za-z0-9_-]{1,64})\.(jsonl|meta\.json|prefix\.json)$/;
const KIND_BY_EXT: Record<string, SubagentFileKind> = {
  jsonl: 'transcript',
  'meta.json': 'meta',
  'prefix.json': 'prefix',
};

/** Parses the trailing segments of a path (absolute or relative to the projects root). */
export function parseSubagentPath(path: string): SubagentPath | null {
  const parts = path.split(/[\\/]+/).filter((p) => p !== '');
  const file = parts.at(-1);
  if (!file || parts.at(-2) !== 'subagents') return null;
  const m = FILE_RE.exec(file);
  const sessionId = parts.at(-3);
  if (!m || !sessionId) return null;
  const kind = KIND_BY_EXT[m[2] ?? ''];
  if (!kind) return null;
  const projectSlug = parts.at(-4);
  return {
    kind,
    agentId: m[1] ?? '',
    sessionId,
    ...(projectSlug ? { projectSlug } : {}),
  };
}

/** Sibling file names of a subagent transcript. */
export function subagentSiblings(agentId: string): { transcript: string; meta: string } {
  return { transcript: `agent-${agentId}.jsonl`, meta: `agent-${agentId}.meta.json` };
}

export interface SubagentMeta {
  /** Agent `name` (= hook `agent_type`). Absent when the meta is missing/garbled. */
  agentType?: string;
  /** `finished:true` appears once the subagent ended (usable as a synthetic SubagentStop). */
  finished?: boolean;
  isBuiltIn?: boolean;
  toolUseId?: string;
}

const AGENT_TYPE_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/;

/** Tolerant reader of a `.meta.json` text. Returns `{}` on any problem. */
export function parseSubagentMeta(text: string): SubagentMeta {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return {};
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const o = raw as Record<string, unknown>;
  const meta: SubagentMeta = {};
  if (typeof o.agentType === 'string' && AGENT_TYPE_RE.test(o.agentType))
    meta.agentType = o.agentType;
  if (typeof o.finished === 'boolean') meta.finished = o.finished;
  if (typeof o.isBuiltIn === 'boolean') meta.isBuiltIn = o.isBuiltIn;
  if (typeof o.toolUseId === 'string' && o.toolUseId.length <= 100) meta.toolUseId = o.toolUseId;
  return meta;
}
