// Pure helpers behind the NPC hover card, panel and team list. Text comes from the i18n
// dictionaries; data from the server (names, task titles, folder names) is shown as is and escaped
// by React.

import type { NpcLogical, OfficeSnapshot, ProjectRef } from '../../../shared/contracts';
import { statusTextKey } from '../../../shared/npc/actor';
import type { MessageKey, Params } from '../../i18n/i18n';

export const KNOWN_DEPARTMENTS = new Set([
  'diretoria',
  'planejamento',
  'engenharia',
  'qualidade',
  'entrega',
  'biblioteca',
]);

export interface NpcInfo {
  key: string;
  kind: 'fixed' | 'freelancer';
  /** Nickname shown as the main name. */
  name: string;
  /** Full name when the team config has one. */
  fullName: string | null;
  /** Job title (agent role). */
  title: string | null;
  agentType: string;
  departmentId: string | null;
  departmentName: string | null;
  logical: NpcLogical | null;
}

/** Everything the UI knows about one NPC key, from the snapshot alone. */
export function npcInfo(snapshot: OfficeSnapshot | null, key: string): NpcInfo | null {
  if (!snapshot) return null;
  const logical = snapshot.npcs.find((n) => n.key === key) ?? null;
  const agent = snapshot.team.agents.find((a) => a.agentType === key);
  if (agent) {
    const dept = snapshot.team.departments.find((d) => d.id === agent.department);
    return {
      key,
      kind: 'fixed',
      name: agent.nickname,
      fullName: agent.fullName ?? null,
      title: agent.title ?? null,
      agentType: agent.agentType,
      departmentId: agent.department ?? null,
      departmentName: dept?.name ?? agent.department ?? null,
      logical,
    };
  }
  if (logical) {
    return {
      key,
      kind: logical.kind,
      name: logical.displayName,
      fullName: null,
      title: logical.kind === 'freelancer' ? (snapshot.team.freelancer?.title ?? null) : null,
      agentType: logical.agentType,
      departmentId: null,
      departmentName: null,
      logical,
    };
  }
  return null;
}

export type ElapsedKey = 'time.sec' | 'time.min' | 'time.hm';

/** "42 s", "5 min", "2 h 5 min": rounded down, never negative. */
export function formatElapsed(ms: number): { key: ElapsedKey; params: Params } {
  const total = Math.max(0, Math.floor(ms / 1000));
  if (total < 60) return { key: 'time.sec', params: { n: total } };
  const minutes = Math.floor(total / 60);
  if (minutes < 60) return { key: 'time.min', params: { n: minutes } };
  return { key: 'time.hm', params: { h: Math.floor(minutes / 60), m: minutes % 60 } };
}

export interface StatusText {
  key: MessageKey;
  params: Params;
  /** Which icon sprite pairs with this text (never icon alone, CA-72). */
  icon: 'gear' | 'alert' | 'zzz' | 'idle';
}

/** Folder to show for a project reference (null when unknown). */
export function projectName(
  ref: ProjectRef | undefined,
): { kind: 'dev' | 'outside'; name: string } | null {
  if (!ref || ref.kind === 'unknown') return null;
  return ref.kind === 'dev'
    ? { kind: 'dev', name: ref.name }
    : { kind: 'outside', name: ref.basename };
}

/**
 * Status line: "idle", "working on <task> in project <folder>", "waiting for approval".
 * `sleepyMs` = how long the NPC has been idle at the desk (>= 30 min shows the dozing text).
 */
export function statusText(
  logical: NpcLogical | null,
  projectLabel: (p: { kind: 'dev' | 'outside'; name: string }) => string,
  sleepy = false,
): StatusText {
  const kind = statusTextKey(
    sleepy ? { mode: 'atDesk', idleMs: Number.MAX_SAFE_INTEGER } : null,
    logical?.status ?? 'idle',
  );
  if (kind === 'awaiting') return { key: 'team.status.awaiting', params: {}, icon: 'alert' };
  if (kind === 'working') {
    const project = projectName(logical?.project);
    const folder = project ? projectLabel(project) : null;
    if (logical?.taskTitle && folder)
      return {
        key: 'team.status.working',
        params: { tarefa: logical.taskTitle, pasta: folder },
        icon: 'gear',
      };
    if (folder)
      return { key: 'team.status.working.project', params: { pasta: folder }, icon: 'gear' };
    return { key: 'team.status.working.plain', params: {}, icon: 'gear' };
  }
  return kind === 'sleepy'
    ? { key: 'team.status.sleepy', params: {}, icon: 'zzz' }
    : { key: 'team.status.idle', params: {}, icon: 'idle' };
}

export const SLEEPY_MS = 30 * 60_000;

/** Whether an idle NPC has been idle long enough to doze (PA-16). */
export function isSleepy(logical: NpcLogical | null, nowMs: number): boolean {
  return logical !== null && logical.status === 'idle' && nowMs - logical.since >= SLEEPY_MS;
}
