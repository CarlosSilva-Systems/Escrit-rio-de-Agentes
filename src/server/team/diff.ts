import { z } from 'zod';
import { PROTOCOL_VERSION } from '../../shared/contracts';
import type { TeamView } from '../../shared/contracts';

// Team diff -> `team.diff` event (T-30a, CA-21): drives the welcome/farewell scenes and the
// "provisional desk" warning. Pure.

const COMPARED_FIELDS = [
  'nickname',
  'fullName',
  'title',
  'department',
  'desk',
  'provisional',
  'sprite',
  'badge',
] as const;
type ComparedField = (typeof COMPARED_FIELDS)[number];

export interface TeamMemberRef {
  agentType: string;
  nickname: string;
  department: string | null;
  desk: string | null;
  provisional: boolean;
}

export interface TeamDiff {
  added: TeamMemberRef[];
  removed: TeamMemberRef[];
  changed: { agentType: string; fields: ComparedField[] }[];
  /** Added agents that landed on a provisional desk (no free desk in the department). */
  provisionalAdded: string[];
}

const memberRef = (a: TeamView['agents'][number]): TeamMemberRef => ({
  agentType: a.agentType,
  nickname: a.nickname,
  department: a.department ?? null,
  desk: a.desk ?? null,
  provisional: a.provisional ?? false,
});

export function diffTeams(prev: TeamView | null, next: TeamView): TeamDiff {
  const before = new Map((prev?.agents ?? []).map((a) => [a.agentType, a]));
  const after = new Map(next.agents.map((a) => [a.agentType, a]));
  const added: TeamMemberRef[] = [];
  const removed: TeamMemberRef[] = [];
  const changed: TeamDiff['changed'] = [];
  for (const [type, a] of after) {
    const old = before.get(type);
    if (!old) {
      added.push(memberRef(a));
      continue;
    }
    const fields = COMPARED_FIELDS.filter((f) => (old[f] ?? null) !== (a[f] ?? null));
    if (fields.length > 0) changed.push({ agentType: type, fields });
  }
  for (const [type, a] of before) if (!after.has(type)) removed.push(memberRef(a));
  const provisionalAdded = added
    .filter((m) => m.desk === null || m.provisional)
    .map((m) => m.agentType);
  return { added, removed, changed, provisionalAdded };
}

export const isEmptyDiff = (d: TeamDiff) =>
  d.added.length + d.removed.length + d.changed.length === 0;

const MemberRefSchema = z.object({
  agentType: z.string(),
  nickname: z.string(),
  department: z.string().nullable(),
  desk: z.string().nullable(),
  provisional: z.boolean(),
});

export const TeamDiffEventSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  kind: z.literal('team.diff'),
  ts: z.number().int().nonnegative(),
  /** true on the first load (nothing to compare against): scenes must not play. */
  initial: z.boolean(),
  added: z.array(MemberRefSchema),
  removed: z.array(MemberRefSchema),
  changed: z.array(z.object({ agentType: z.string(), fields: z.array(z.string()) })),
  provisionalAdded: z.array(z.string()),
});
export type TeamDiffEvent = z.infer<typeof TeamDiffEventSchema>;

/** Returns null when nothing changed. */
export function toTeamDiffEvent(
  prev: TeamView | null,
  next: TeamView,
  ts: number,
): TeamDiffEvent | null {
  const diff = diffTeams(prev, next);
  if (isEmptyDiff(diff)) return null;
  return { v: PROTOCOL_VERSION, kind: 'team.diff', ts, initial: prev === null, ...diff };
}
