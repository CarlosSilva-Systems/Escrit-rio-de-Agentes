// NPC manager: turns the office state from the server (team + logical NPCs) into walking, sitting,
// working characters. The behaviour itself is the pure FSM in src/shared/npc; this class owns the
// actors, the seat/queue bookkeeping and the sprites handed to the renderer.

import type { NpcLogical, TeamView } from '../../../shared/contracts';
import {
  applyStatus,
  createActor,
  isWalking,
  poseOf,
  startArriving,
  startLeaving,
  startReturning,
  stepActor,
  type NpcActor,
  type NpcEnv,
  type NpcMode,
} from '../../../shared/npc/actor';
import { SeatAllocator } from '../../../shared/npc/seats';
import { freelancerSprite, spriteKeyFor } from '../../../shared/npc/spriteKeys';
import type { Tile } from '../../../shared/world/grid';
import { PathCache } from '../../../shared/world/pathfinding';
import type { Atlas } from '../atlas';
import type { Simulation } from '../demo';
import { characterSprite, type SpriteInstance } from '../sprites';
import type { World } from '../world/world';

export interface TeamChange {
  added: { agentType: string; nickname: string; provisional?: boolean }[];
  removed: { agentType: string; nickname: string }[];
}

export interface NpcManagerOptions {
  reducedMotion: () => boolean;
  /** Welcome / farewell scenes (T-30b) report here so the HUD can announce them. */
  onTeamChange?: (change: TeamChange) => void;
}

interface Entry {
  actor: NpcActor;
  spriteKey: string;
  kind: 'fixed' | 'freelancer';
  nickname: string;
  sig: string;
}

export interface NpcDebugRow {
  key: string;
  mode: NpcMode;
  anim: string;
  tile: Tile;
  x: number;
  y: number;
}

const ICON_SORT_Y = 1_000_000;

export class NpcManager implements Simulation {
  private readonly entries = new Map<string, Entry>();
  private readonly seats: SeatAllocator;
  private readonly paths: PathCache;
  private readonly env: NpcEnv;
  private readonly queueOwner: (string | null)[];
  /** Reused every frame (the renderer only reads it during render). */
  private readonly spriteBuf: SpriteInstance[] = [];
  private teamSeen = false;
  private team: TeamView | null = null;

  constructor(
    private readonly world: World,
    private readonly atlas: Atlas,
    private readonly options: NpcManagerOptions,
  ) {
    const map = world.map;
    this.seats = new SeatAllocator(map);
    this.paths = new PathCache(world.grid, 512);
    const doorTile = map.doors.find((d) => d.id === map.spawn.entrance)?.tiles[0];
    const entrance: Tile = doorTile ? [doorTile[0], doorTile[1]] : [8, 51];
    const queueTiles: Tile[] = map.spawn.approvalQueue.flatMap((id) => {
      const t = map.pois.find((p) => p.id === id)?.tiles[0];
      return t ? [[t[0], t[1]] as Tile] : [];
    });
    this.queueOwner = queueTiles.map(() => null);
    this.env = {
      findPath: (from, to) => this.paths.find(from, to, { allowBlockedGoal: true }),
      entrance,
      counter: [map.spawn.receptionCounter[0], map.spawn.receptionCounter[1]],
      queueTiles,
      claimQueue: (key) => {
        const i = this.queueOwner.findIndex((o) => o === null || o === key);
        if (i < 0) return null;
        this.queueOwner[i] = key;
        return i;
      },
      releaseQueue: (key) => {
        const i = this.queueOwner.indexOf(key);
        if (i >= 0) this.queueOwner[i] = null;
      },
      reducedMotion: false,
    };
  }

  private hasSheet = (key: string) => this.atlas.frame(`${key}/idle/s/0`) !== undefined;

  /** The env carries the current reduced-motion preference (read live, it can change any time). */
  private refresh(): void {
    this.env.reducedMotion = this.options.reducedMotion();
  }

  /** Applies the team: first call seats everyone; later calls play the welcome/farewell scenes. */
  syncTeam(team: TeamView): void {
    this.refresh();
    if (team === this.team) return;
    this.team = team;
    const agents = team.agents;

    if (!this.teamSeen) {
      this.teamSeen = true;
      this.seats.claimTeam(
        agents.map((a) => ({
          key: a.agentType,
          member: {
            agentType: a.agentType,
            department: a.department,
            desk: a.desk,
            isLead: a.isLead,
          },
        })),
      );
      for (const a of agents) this.addFixed(a, false);
      return;
    }

    const after = new Set(agents.map((a) => a.agentType));
    const change: TeamChange = { added: [], removed: [] };
    for (const a of agents) {
      const existing = this.entries.get(a.agentType);
      if (existing) {
        // Back on the team while still walking out: turn around instead of vanishing.
        if (existing.actor.mode === 'leaving') {
          startReturning(existing.actor, this.env);
          change.added.push({ agentType: a.agentType, nickname: a.nickname });
        }
        continue;
      }
      this.seats.claim(a.agentType, {
        agentType: a.agentType,
        department: a.department,
        desk: a.desk,
        isLead: a.isLead,
      });
      this.addFixed(a, true);
      change.added.push({
        agentType: a.agentType,
        nickname: a.nickname,
        provisional: this.seats.seatFor(a.agentType)?.provisional ?? false,
      });
    }
    for (const [key, entry] of this.entries) {
      if (
        entry.kind === 'fixed' &&
        !after.has(key) &&
        entry.actor.mode !== 'leaving' &&
        entry.actor.mode !== 'gone'
      ) {
        startLeaving(entry.actor, this.env);
        change.removed.push({ agentType: key, nickname: entry.nickname });
      }
    }
    if (change.added.length > 0 || change.removed.length > 0) this.options.onTeamChange?.(change);
  }

  private addFixed(agent: TeamView['agents'][number], scene: boolean): void {
    const seat = this.seats.seatFor(agent.agentType);
    if (!seat) return;
    const actor = createActor(agent.agentType, seat);
    if (scene) startArriving(actor, this.env);
    this.entries.set(agent.agentType, {
      actor,
      spriteKey: spriteKeyFor({ agentType: agent.agentType, sprite: agent.sprite }, this.hasSheet),
      kind: 'fixed',
      nickname: agent.nickname,
      sig: '',
    });
  }

  /** Applies the logical status of every NPC; Freelancers come and go with the list. */
  syncNpcs(npcs: readonly NpcLogical[]): void {
    this.refresh();
    const present = new Set<string>();
    for (const n of npcs) {
      present.add(n.key);
      let entry = this.entries.get(n.key);
      // An idle Freelancer with no actor already left: never recreate a ghost for it.
      if (!entry && n.kind === 'freelancer' && !(n.status === 'idle' && n.activeCount === 0)) {
        const seat = this.seats.claimVisitor(n.key);
        if (!seat) continue;
        const actor = createActor(n.key, seat);
        startArriving(actor, this.env);
        entry = {
          actor,
          spriteKey: freelancerSprite(n.key),
          kind: 'freelancer',
          nickname: n.displayName,
          sig: '',
        };
        this.entries.set(n.key, entry);
      }
      if (!entry) continue; // an agent that is not on the team (yet)
      const sig = `${n.status}|${n.tool ?? ''}|${n.activeCount}|${n.since}`;
      if (sig === entry.sig) continue;
      entry.sig = sig;
      if (entry.kind === 'freelancer' && n.status === 'idle' && n.activeCount === 0) {
        // Done: the Freelancer leaves (the server drops it from the snapshot 5 s later).
        startLeaving(entry.actor, this.env);
      } else {
        applyStatus(entry.actor, n.status, n.tool, this.env);
      }
    }
    for (const [key, entry] of this.entries) {
      if (entry.kind === 'freelancer' && !present.has(key)) startLeaving(entry.actor, this.env);
    }
  }

  update(dtMs: number): void {
    this.refresh();
    for (const [key, entry] of this.entries) {
      stepActor(entry.actor, dtMs, this.env);
      if (entry.actor.mode === 'gone') {
        this.seats.release(key);
        this.entries.delete(key);
      }
    }
  }

  sprites(): SpriteInstance[] {
    const out = this.spriteBuf;
    out.length = 0;
    const reduced = this.options.reducedMotion();
    for (const [key, { actor, spriteKey }] of this.entries) {
      const pose = poseOf(actor, reduced);
      out.push(
        characterSprite(
          key,
          spriteKey,
          pose.anim,
          pose.dir,
          pose.frame,
          actor.x,
          actor.y + pose.hop,
        ),
      );
      if (pose.icon) {
        out.push({
          id: `${key}#icon`,
          frameName: `icon/${pose.icon}`,
          flip: false,
          x: actor.x + 3,
          y: actor.y - 27 + pose.iconBob,
          sortY: ICON_SORT_Y,
        });
      }
    }
    return out;
  }

  moving(): boolean {
    return this.movingCount() > 0;
  }

  movingCount(): number {
    let n = 0;
    for (const { actor } of this.entries.values()) {
      if (isWalking(actor) || actor.mode === 'celebrating') n++;
    }
    return n;
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }

  /** World pixel position of an NPC's tile (top-left), or null. */
  positionOf(key: string): { x: number; y: number } | null {
    const e = this.entries.get(key);
    return e ? { x: e.actor.x, y: e.actor.y } : null;
  }

  /** Where a desk is, for "go to desk". */
  deskOf(key: string): Tile | null {
    return this.entries.get(key)?.actor.desk.tile ?? null;
  }

  spriteKeyOf(key: string): string | null {
    return this.entries.get(key)?.spriteKey ?? null;
  }

  debug(): NpcDebugRow[] {
    const reduced = this.options.reducedMotion();
    return [...this.entries].map(([key, { actor }]) => ({
      key,
      mode: actor.mode,
      anim: poseOf(actor, reduced).anim,
      tile: actor.tile,
      x: actor.x,
      y: actor.y,
    }));
  }
}
