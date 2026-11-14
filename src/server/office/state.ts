import {
  PROTOCOL_VERSION,
  type ActivityItem,
  type Diagnostic,
  type NpcLogical,
  type OfficeEvent,
  type OfficeSnapshot,
  type ProjectRef,
  type ProjectSummary,
  type PublicConfig,
  type TeamView,
  type ToolCategory,
} from '../../shared/contracts';
import type { AgentIdentity, ResolvedAgent } from '../team/resolve';

// OfficeState (T-21, ARQUITETURA §6.1): the logical status of every NPC, derived from events.
// Pure logic: clock and team lookup are injected, no I/O. PRIVACY: only metadata is kept
// (names, categories, ids, project names); never prompts, tool inputs or outputs.
//
// Rules (CA-15, CA-16, CA-17):
// - working = at least one live instance. Subagent instances are keyed by agent id (SubagentStart
//   adds, SubagentStop removes; 2 Start + 1 Stop = working; an orphan Stop never goes negative;
//   the same Start twice is one instance, so a reconnect/duplicate source is idempotent).
// - The main thread of a session is one instance between prompt.submit (or its first tool use)
//   and turn.stop. Its NPC is the lead ("chefe") unless the session runs `--agent <type>`.
// - awaiting beats working (permission request/notification observed); idle otherwise.
// - An unknown agent_type becomes a freelancer NPC (`freelancer:<agentId>`), dropped 5 s after
//   its last instance ends (while idle with activeCount 0 the client plays the exit scene).
// - An instance silent for 15 min expires (counter); an awaiting mark expires after 10 min.

export interface TeamLookup {
  readonly view: TeamView;
  resolve(ident: AgentIdentity): ResolvedAgent;
  readonly publicDiagnostics: Diagnostic[];
}

export interface OfficeStateDeps {
  team: TeamLookup;
  config: () => PublicConfig;
  now?: () => number;
  /** Extra diagnostics (watchers, hook install...) merged into the snapshot. */
  extraDiagnostics?: () => Diagnostic[];
}

export type StateChange =
  | { type: 'npc'; npc: NpcLogical }
  | { type: 'activity'; item: ActivityItem }
  | { type: 'project'; project: ProjectSummary };

export const INSTANCE_TTL_MS = 15 * 60_000;
export const AWAITING_TTL_MS = 10 * 60_000;
export const FREELANCER_LINGER_MS = 5000;
export const ACTIVITY_RING = 500;
export const NPC_HISTORY_RING = 50;
export const SNAPSHOT_ACTIVITY = 200;
const SESSION_ACTIVE_MS = 10 * 60_000;
const RECENTLY_STOPPED_MS = 60_000;
const PROJECT_EMIT_MS = 5000;
const MAX_PROJECTS = 50;
const MAX_SESSIONS = 500;

const AWAITING_NOTIFICATIONS = new Set([
  'permission_prompt',
  'agent_needs_input',
  'elicitation_dialog',
]);

interface Instance {
  id: string;
  sessionId: string | null;
  agentType: string | null;
  agentId: string | null;
  ownerKey: string;
  project: ProjectRef;
  lastEventAt: number;
  tool?: { category: ToolCategory; useId?: string };
  awaitingSince?: number;
}

interface NpcRecord {
  key: string;
  kind: 'fixed' | 'freelancer';
  agentType: string;
  displayName: string;
  status: NpcLogical['status'];
  since: number;
  lastEventAt?: number;
  approvalIds: string[];
  taskRef?: string;
  taskTitle?: string;
  /** Freelancers only: when to drop the NPC once its last instance ended. */
  expiresAt?: number;
  /** Serialized last published view (change detection). */
  last?: string;
}

interface ProjectRecord {
  lastActivityAt: number;
  emittedAt: number;
  active: boolean;
}

const isDev = (p: ProjectRef): p is Extract<ProjectRef, { kind: 'dev' }> => p.kind === 'dev';

export class OfficeState {
  private readonly now: () => number;
  private readonly instances = new Map<string, Instance>();
  private readonly npcs = new Map<string, NpcRecord>();
  private readonly activity: ActivityItem[] = [];
  private readonly history = new Map<string, ActivityItem[]>();
  private readonly projects = new Map<string, ProjectRecord>();
  private readonly sessions = new Map<string, number>();
  private readonly recentlyStopped = new Map<string, number>();
  private readonly listeners = new Set<(change: StateChange) => void>();
  private anonSeq = 0;
  /** NPC keys whose instances changed since the last refresh. */
  private dirty = new Set<string>();
  /** Diagnostic counters owned by the state (merged into /api/diag). */
  readonly counters = { orphanStops: 0, expiredInstances: 0, expiredAwaiting: 0, events: 0 };

  constructor(private readonly deps: OfficeStateDeps) {
    this.now = deps.now ?? (() => Date.now());
    this.syncFixedNpcs();
  }

  onChange(listener: (change: StateChange) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // --- Events ---------------------------------------------------------------------------

  apply(event: OfficeEvent): void {
    this.counters.events++;
    const now = this.now();
    const ts = Math.min(event.ts, now);
    const resolved = this.deps.team.resolve({
      agentType: event.agent.agentType,
      agentId: event.agent.agentId,
    });
    this.ensureNpc(resolved, now);
    this.dirty.add(resolved.key);
    if (event.sessionId) this.touchSession(event.sessionId, ts);

    switch (event.kind) {
      case 'session.start':
        break;
      case 'session.end':
        if (event.sessionId !== null) {
          this.removeWhere((i) => i.sessionId === event.sessionId, now);
        }
        break;
      case 'prompt.submit': {
        const inst = this.upsert(event, resolved, true, ts);
        if (inst) {
          delete inst.tool;
          delete inst.awaitingSince;
        }
        break;
      }
      case 'turn.stop':
        if (event.agent.agentId === null) this.removeInstance(mainId(event), now);
        break;
      case 'tool.pre': {
        const inst = this.upsert(event, resolved, true, ts);
        if (inst && event.tool) {
          inst.tool = {
            category: event.tool.category,
            ...(event.tool.useId ? { useId: event.tool.useId } : {}),
          };
        }
        break;
      }
      case 'tool.post':
      case 'tool.fail': {
        // Never creates an instance: a late event must not resurrect a finished agent.
        const inst = this.upsert(event, resolved, false, ts);
        if (inst) {
          if (!inst.tool?.useId || !event.tool?.useId || inst.tool.useId === event.tool.useId) {
            delete inst.tool;
          }
          delete inst.awaitingSince;
        }
        break;
      }
      case 'subagent.start':
        this.startSub(event, resolved, ts);
        break;
      case 'subagent.stop':
        this.stopSub(event, resolved, now);
        break;
      case 'permission.request': {
        const inst = this.upsert(event, resolved, true, ts);
        if (inst) inst.awaitingSince = now;
        break;
      }
      case 'notification':
        if (event.notificationType && AWAITING_NOTIFICATIONS.has(event.notificationType)) {
          const inst = this.upsert(event, resolved, true, ts);
          if (inst) inst.awaitingSince = now;
        }
        break;
      case 'task.created':
      case 'task.completed': {
        const npc = this.npcs.get(resolved.key);
        if (!npc) break;
        if (event.kind === 'task.created') {
          if (event.task?.ref) npc.taskRef = event.task.ref;
          if (event.task?.subject) npc.taskTitle = event.task.subject;
        } else if (!event.task?.ref || event.task.ref === npc.taskRef) {
          delete npc.taskRef;
          delete npc.taskTitle;
        }
        break;
      }
    }

    this.recordActivity(event, resolved.key);
    this.touchProject(event.project, ts, now);
    this.flushDirty(now);
  }

  /** Re-resolves every instance and NPC after escritorio.json/QUADRO.md changed (CA-13, CA-17, CA-21). */
  onTeamChange(): void {
    const now = this.now();
    for (const inst of this.instances.values()) {
      const resolved = this.deps.team.resolve({ agentType: inst.agentType, agentId: inst.agentId });
      this.ensureNpc(resolved, now);
      inst.ownerKey = resolved.key; // a promoted freelancer moves to its fixed NPC, live
    }
    this.syncFixedNpcs();
    const inView = new Set(this.deps.team.view.agents.map((a) => a.agentType));
    for (const npc of [...this.npcs.values()]) {
      if (npc.kind === 'fixed' && !inView.has(npc.key) && this.countOf(npc.key) === 0) {
        this.npcs.delete(npc.key); // left the team and idle: gone
        this.history.delete(npc.key);
      }
    }
    for (const key of this.npcs.keys()) this.dirty.add(key);
    this.flushDirty(now);
  }

  /** Approval ids linked to an NPC (ApprovalBroker, T-46). */
  setApprovalIds(npcKey: string, ids: string[]): void {
    const npc = this.npcs.get(npcKey);
    if (!npc) return;
    npc.approvalIds = [...ids];
    this.dirty.add(npcKey);
    this.flushDirty(this.now());
  }

  /** Periodic housekeeping; also callable from tests with a fake clock. */
  sweep(): void {
    const now = this.now();
    for (const inst of [...this.instances.values()]) {
      if (now - inst.lastEventAt >= INSTANCE_TTL_MS) {
        this.counters.expiredInstances++;
        this.removeInstance(inst.id, now);
      } else if (inst.awaitingSince !== undefined && now - inst.awaitingSince >= AWAITING_TTL_MS) {
        this.counters.expiredAwaiting++;
        delete inst.awaitingSince;
        this.dirty.add(inst.ownerKey);
      }
    }
    for (const [id, at] of this.recentlyStopped) {
      if (now - at >= RECENTLY_STOPPED_MS) this.recentlyStopped.delete(id);
    }
    for (const npc of [...this.npcs.values()]) {
      if (
        npc.kind === 'freelancer' &&
        npc.expiresAt !== undefined &&
        npc.expiresAt <= now &&
        this.countOf(npc.key) === 0
      ) {
        this.npcs.delete(npc.key);
        this.history.delete(npc.key);
      }
    }
    this.flushDirty(now);
  }

  // --- Reads ----------------------------------------------------------------------------

  snapshot(): OfficeSnapshot {
    return {
      v: PROTOCOL_VERSION,
      now: this.now(),
      team: this.deps.team.view,
      npcs: this.npcList(),
      approvals: [],
      projects: this.projectList(),
      overflowProjects: [],
      usage: null,
      activity: this.activity.slice(-SNAPSHOT_ACTIVITY),
      config: this.deps.config(),
      diagnostics: [...this.deps.team.publicDiagnostics, ...(this.deps.extraDiagnostics?.() ?? [])],
    };
  }

  npc(key: string): NpcLogical | undefined {
    const rec = this.npcs.get(key);
    return rec ? this.build(rec) : undefined;
  }

  /** Latest activity of one NPC, newest first (metadata only). */
  historyOf(key: string, limit = NPC_HISTORY_RING): ActivityItem[] {
    return (this.history.get(key) ?? []).slice(-limit).reverse();
  }

  hasNpc(key: string): boolean {
    return this.npcs.has(key);
  }

  /** Sessions with an event in the last 10 min. */
  activeSessionCount(): number {
    const now = this.now();
    let n = 0;
    for (const ts of this.sessions.values()) if (now - ts < SESSION_ACTIVE_MS) n++;
    return n;
  }

  liveInstanceCount(): number {
    return this.instances.size;
  }

  // --- Internals ------------------------------------------------------------------------

  private npcList(): NpcLogical[] {
    const order = new Map(this.deps.team.view.agents.map((a, i) => [a.agentType, i]));
    return [...this.npcs.values()]
      .sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === 'fixed' ? -1 : 1;
        if (a.kind === 'fixed') return (order.get(a.key) ?? 1e6) - (order.get(b.key) ?? 1e6);
        return a.since - b.since;
      })
      .map((rec) => this.build(rec));
  }

  private projectList(): ProjectSummary[] {
    const active = this.activeProjectNames();
    return [...this.projects]
      .sort(([, a], [, b]) => b.lastActivityAt - a.lastActivityAt)
      .map(([name, p]) => ({ name, active: active.has(name), lastActivityAt: p.lastActivityAt }));
  }

  private activeProjectNames(): Set<string> {
    const names = new Set<string>();
    for (const inst of this.instances.values()) {
      if (isDev(inst.project)) names.add(inst.project.name);
    }
    return names;
  }

  private syncFixedNpcs(): void {
    const now = this.now();
    for (const agent of this.deps.team.view.agents) {
      const displayName = agent.nickname.slice(0, 60);
      const existing = this.npcs.get(agent.agentType);
      if (existing) {
        existing.displayName = displayName;
        existing.kind = 'fixed';
        delete existing.expiresAt;
      } else {
        this.npcs.set(agent.agentType, {
          key: agent.agentType,
          kind: 'fixed',
          agentType: agent.agentType,
          displayName,
          status: 'idle',
          since: now,
          approvalIds: [],
        });
      }
    }
  }

  private ensureNpc(resolved: ResolvedAgent, now: number): NpcRecord {
    const existing = this.npcs.get(resolved.key);
    if (existing) return existing;
    const freelancerName = this.deps.team.view.freelancer?.nickname ?? 'Freelancer';
    const rec: NpcRecord = {
      key: resolved.key,
      kind: resolved.kind,
      agentType: resolved.agentType.slice(0, 100) || 'unknown',
      displayName: (resolved.kind === 'fixed' ? resolved.agent.nickname : freelancerName).slice(
        0,
        60,
      ),
      status: 'idle',
      since: now,
      approvalIds: [],
    };
    this.npcs.set(rec.key, rec);
    return rec;
  }

  private countOf(key: string): number {
    let n = 0;
    for (const inst of this.instances.values()) if (inst.ownerKey === key) n++;
    return n;
  }

  /**
   * Gets or creates the instance an event belongs to. `adopt=false` never creates one.
   * Late events of a subagent that already stopped never recreate it either.
   */
  private upsert(
    event: OfficeEvent,
    resolved: ResolvedAgent,
    adopt: boolean,
    ts: number,
  ): Instance | null {
    const agentId = event.agent.agentId;
    const id = agentId === null ? mainId(event) : `sub:${agentId}`;
    let inst = this.instances.get(id);
    if (!inst) {
      if (!adopt) return null;
      if (agentId !== null && this.isRecentlyStopped(agentId)) return null;
      inst = this.create(id, event, resolved, ts);
    }
    this.dirty.add(inst.ownerKey);
    inst.lastEventAt = Math.max(inst.lastEventAt, ts);
    if (event.project.kind !== 'unknown') inst.project = event.project;
    return inst;
  }

  private create(id: string, event: OfficeEvent, resolved: ResolvedAgent, ts: number): Instance {
    const inst: Instance = {
      id,
      sessionId: event.sessionId,
      agentType: event.agent.agentType,
      agentId: event.agent.agentId,
      ownerKey: resolved.key,
      project: event.project,
      lastEventAt: ts,
    };
    this.instances.set(id, inst);
    this.dirty.add(inst.ownerKey);
    const npc = this.npcs.get(inst.ownerKey);
    if (npc) delete npc.expiresAt; // a new instance cancels a lingering freelancer's removal
    return inst;
  }

  private isRecentlyStopped(agentId: string): boolean {
    const at = this.recentlyStopped.get(agentId);
    return at !== undefined && this.now() - at < RECENTLY_STOPPED_MS;
  }

  private startSub(event: OfficeEvent, resolved: ResolvedAgent, ts: number): void {
    const agentId = event.agent.agentId;
    const id = agentId !== null ? `sub:${agentId}` : `sub:anon:${++this.anonSeq}`;
    if (agentId !== null) this.recentlyStopped.delete(agentId);
    const existing = this.instances.get(id);
    if (existing) {
      existing.lastEventAt = Math.max(existing.lastEventAt, ts);
      this.dirty.add(existing.ownerKey);
      return; // duplicate Start / reconnect: idempotent
    }
    this.create(id, event, resolved, ts);
  }

  private stopSub(event: OfficeEvent, resolved: ResolvedAgent, now: number): void {
    const agentId = event.agent.agentId;
    if (agentId !== null) {
      this.recentlyStopped.set(agentId, now);
      if (!this.removeInstance(`sub:${agentId}`, now)) this.counters.orphanStops++;
      return;
    }
    // No id: drop the oldest anonymous instance of the same owner, if there is one.
    const anon = [...this.instances.values()].find(
      (i) => i.id.startsWith('sub:anon:') && i.ownerKey === resolved.key,
    );
    if (anon) this.removeInstance(anon.id, now);
    else this.counters.orphanStops++;
  }

  private removeInstance(id: string, now: number): boolean {
    const inst = this.instances.get(id);
    if (!inst) return false;
    this.instances.delete(id);
    this.dirty.add(inst.ownerKey);
    const npc = this.npcs.get(inst.ownerKey);
    if (npc?.kind === 'freelancer' && this.countOf(inst.ownerKey) === 0) {
      npc.expiresAt = now + FREELANCER_LINGER_MS;
    }
    return true;
  }

  private removeWhere(predicate: (i: Instance) => boolean, now: number): void {
    for (const inst of [...this.instances.values()]) {
      if (predicate(inst)) this.removeInstance(inst.id, now);
    }
  }

  private touchSession(id: string, ts: number): void {
    this.sessions.delete(id);
    this.sessions.set(id, ts);
    if (this.sessions.size > MAX_SESSIONS) {
      const oldest = this.sessions.keys().next().value;
      if (oldest !== undefined) this.sessions.delete(oldest);
    }
  }

  private touchProject(project: ProjectRef, ts: number, now: number): void {
    if (!isDev(project)) return;
    const active = this.activeProjectNames().has(project.name);
    const prev = this.projects.get(project.name);
    const entry: ProjectRecord = prev ?? { lastActivityAt: ts, emittedAt: 0, active: !active };
    entry.lastActivityAt = Math.max(entry.lastActivityAt, ts);
    const changed =
      prev === undefined || entry.active !== active || now - entry.emittedAt > PROJECT_EMIT_MS;
    entry.active = active;
    this.projects.set(project.name, entry);
    this.trimProjects();
    if (changed) {
      entry.emittedAt = now;
      this.emit({
        type: 'project',
        project: { name: project.name, active, lastActivityAt: entry.lastActivityAt },
      });
    }
  }

  private trimProjects(): void {
    if (this.projects.size <= MAX_PROJECTS) return;
    const active = this.activeProjectNames();
    let oldestName: string | undefined;
    let oldestAt = Infinity;
    for (const [name, p] of this.projects) {
      if (!active.has(name) && p.lastActivityAt < oldestAt) {
        oldestAt = p.lastActivityAt;
        oldestName = name;
      }
    }
    if (oldestName !== undefined) this.projects.delete(oldestName);
  }

  private recordActivity(event: OfficeEvent, npcKey: string): void {
    if (event.kind === 'tool.post') return; // noise: tool.pre already tells what happened
    let summary: string | undefined;
    switch (event.kind) {
      case 'tool.pre':
      case 'tool.fail':
      case 'permission.request':
        summary = event.tool?.name;
        break;
      case 'notification':
        summary = event.notificationType;
        break;
      case 'subagent.start':
      case 'subagent.stop':
        summary = event.agent.agentType ?? undefined;
        break;
      default:
        summary = event.task?.subject;
    }
    const item: ActivityItem = {
      id: event.id,
      ts: event.ts,
      npcKey,
      kind: event.kind,
      project: event.project,
      ...(event.tool ? { tool: event.tool.category } : {}),
      ...(event.task?.ref ? { taskRef: event.task.ref } : {}),
      ...(summary ? { summary: summary.slice(0, 200) } : {}),
    };
    this.activity.push(item);
    if (this.activity.length > ACTIVITY_RING) {
      this.activity.splice(0, this.activity.length - ACTIVITY_RING);
    }
    const ring = this.history.get(npcKey) ?? [];
    ring.push(item);
    if (ring.length > NPC_HISTORY_RING) ring.splice(0, ring.length - NPC_HISTORY_RING);
    this.history.set(npcKey, ring);
    this.emit({ type: 'activity', item });
  }

  /** Recomputes status of the NPCs touched since the last call and publishes real changes. */
  private flushDirty(now: number): void {
    const keys = this.dirty;
    this.dirty = new Set<string>();
    for (const key of keys) {
      const rec = this.npcs.get(key);
      if (!rec) continue;
      const insts = this.instancesOf(key);
      const awaiting =
        rec.approvalIds.length > 0 || insts.some((i) => i.awaitingSince !== undefined);
      const status: NpcLogical['status'] = awaiting
        ? 'awaiting'
        : insts.length > 0
          ? 'working'
          : 'idle';
      if (status !== rec.status) {
        rec.status = status;
        rec.since = now;
      }
      if (status === 'idle') {
        delete rec.taskRef;
        delete rec.taskTitle;
      }
      if (insts.length > 0) {
        rec.lastEventAt = Math.max(rec.lastEventAt ?? 0, ...insts.map((i) => i.lastEventAt));
      } else if (rec.kind === 'freelancer' && rec.expiresAt === undefined) {
        rec.expiresAt = now + FREELANCER_LINGER_MS; // e.g. created by a late tool.post
      }
      const npc = this.build(rec);
      const serialized = JSON.stringify(npc);
      if (serialized !== rec.last) {
        rec.last = serialized;
        this.emit({ type: 'npc', npc });
      }
    }
  }

  private instancesOf(key: string): Instance[] {
    return [...this.instances.values()]
      .filter((i) => i.ownerKey === key)
      .sort((a, b) => b.lastEventAt - a.lastEventAt);
  }

  private build(rec: NpcRecord): NpcLogical {
    const insts = this.instancesOf(rec.key);
    const withTool = insts.find((i) => i.tool);
    const project = insts.find((i) => i.project.kind !== 'unknown')?.project;
    const npc: NpcLogical = {
      key: rec.key,
      kind: rec.kind,
      agentType: rec.agentType,
      displayName: rec.displayName,
      status: rec.status,
      activeCount: insts.length,
      since: rec.since,
      approvalIds: [...rec.approvalIds],
    };
    if (project) npc.project = project;
    if (rec.taskRef) npc.taskRef = rec.taskRef;
    if (rec.taskTitle) npc.taskTitle = rec.taskTitle;
    if (withTool?.tool) npc.tool = withTool.tool.category;
    if (rec.lastEventAt !== undefined && rec.lastEventAt > 0) npc.lastEventAt = rec.lastEventAt;
    return npc;
  }

  private emit(change: StateChange): void {
    for (const listener of this.listeners) {
      try {
        listener(change);
      } catch {
        // A faulty listener must not break the state machine.
      }
    }
  }
}

function mainId(event: OfficeEvent): string {
  return `main:${event.sessionId ?? '-'}`;
}
