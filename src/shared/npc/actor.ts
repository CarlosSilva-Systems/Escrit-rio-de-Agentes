// NPC behaviour, version 1 (ARQUITETURA §6): a small finite-state machine per NPC.
// Pure and deterministic: no DOM, no clock (the caller passes `dtMs`), no RNG needed for v1
// (routines/wandering come with the next block, which will inject a seeded RNG through `NpcEnv`).
//
//   AtDesk <-> Working (typing/reading by tool category) -> Celebrating (1.5 s) -> AtDesk
//   Awaiting: walk to the Director's door queue (FILA-n) and wait with "!" ; no free slot -> "!" at desk
//   Arriving (welcome / Freelancer): entrance -> reception counter (pause) -> desk
//   Leaving (farewell / Freelancer done): walk to the entrance, then Gone
//   Priority (preemption): Awaiting > Working > Celebrating > AtDesk

import type { ToolCategory } from '../contracts/common';
import type { Tile } from '../world/grid';
import type { Facing, SeatSpot } from './seats';

export type NpcMode =
  | 'atDesk'
  | 'goingToWork'
  | 'working'
  | 'goingToQueue'
  | 'awaiting'
  | 'awaitingAtDesk'
  | 'celebrating'
  | 'returning'
  | 'arriving'
  | 'leaving'
  | 'gone';

export type NpcStatus = 'idle' | 'working' | 'awaiting';
export type NpcDir = 's' | 'n' | 'e' | 'w';
export type NpcAnim = 'walk' | 'idle' | 'sit' | 'type' | 'read';
export type StatusIcon = 'gear' | 'alert' | 'zzz' | null;

export const WALK_SPEED_PX_S = 48;
export const CELEBRATE_MS = 1500;
export const WELCOME_PAUSE_MS = 1200;
/** Idle at the desk this long shows the "zzz" icon (PA-16: 30 min). */
const BOB_STEPS = [0, 2, 3, 2];
export const SLEEPY_AFTER_MS = 30 * 60_000;

/** What the actor needs from the world. Injected, so the FSM runs in plain unit tests. */
export interface NpcEnv {
  findPath(from: Tile, to: Tile): Tile[] | null;
  entrance: Tile;
  counter: Tile;
  /** Waiting tiles in front of the Director's door, FILA-1 first. */
  queueTiles: readonly Tile[];
  claimQueue(key: string): number | null;
  releaseQueue(key: string): void;
  /** CA-22: no walking, no hopping: NPCs jump straight to their destination. */
  reducedMotion: boolean;
}

export interface NpcActor {
  key: string;
  desk: SeatSpot;
  mode: NpcMode;
  /** World pixels of the tile the NPC stands on (top-left); fractional while walking. */
  x: number;
  y: number;
  tile: Tile;
  dir: NpcDir;
  path: Tile[] | null;
  segment: number;
  progress: number;
  tool: ToolCategory | undefined;
  /** Milliseconds in the current mode / animation clock. */
  modeMs: number;
  animMs: number;
  /** Time since the last status change to idle at the desk (for the "zzz" icon). */
  idleMs: number;
  /** Arriving: 0 = walking to the counter, 1 = pausing there, 2 = walking to the desk. */
  stage: number;
  /** Status that arrived while the actor was busy arriving; applied when it sits down. */
  pending: { status: NpcStatus; tool: ToolCategory | undefined } | null;
  queueSlot: number | null;
}

const FACING_DIR: Record<Facing, NpcDir> = { south: 's', north: 'n', east: 'e', west: 'w' };

function place(a: NpcActor, tile: Tile): void {
  a.tile = tile;
  a.x = tile[0] * 16;
  a.y = tile[1] * 16;
  a.path = null;
  a.segment = 0;
  a.progress = 0;
}

export function createActor(key: string, desk: SeatSpot): NpcActor {
  const a: NpcActor = {
    key,
    desk,
    mode: 'atDesk',
    x: 0,
    y: 0,
    tile: desk.tile,
    dir: FACING_DIR[desk.facing],
    path: null,
    segment: 0,
    progress: 0,
    tool: undefined,
    modeMs: 0,
    animMs: 0,
    idleMs: 0,
    stage: 0,
    pending: null,
    queueSlot: null,
  };
  place(a, desk.tile);
  return a;
}

const same = (a: Tile, b: Tile) => a[0] === b[0] && a[1] === b[1];

/** Starts walking to `dest`; false when already there or when snapping (reduced motion/no path). */
function walkTo(a: NpcActor, dest: Tile, env: NpcEnv): boolean {
  if (a.path) {
    // Re-plan from where the NPC is: keep the current partial step, route from the next tile
    // (no jump of up to 16 px back to the last tile).
    const next = a.path[a.segment + 1];
    const from = a.path[a.segment] as Tile;
    const rest =
      env.reducedMotion || !next ? null : same(next, dest) ? [next] : env.findPath(next, dest);
    if (!rest) {
      place(a, dest);
      return false;
    }
    a.path = [from, ...rest];
    a.segment = 0;
    return true;
  }
  if (same(a.tile, dest)) return false;
  const path = env.reducedMotion ? null : env.findPath(a.tile, dest);
  if (!path || path.length < 2) {
    place(a, dest);
    return false;
  }
  a.path = path;
  a.segment = 0;
  a.progress = 0;
  return true;
}

function setMode(a: NpcActor, mode: NpcMode): void {
  a.mode = mode;
  a.modeMs = 0;
}

function sitDown(a: NpcActor): void {
  a.dir = FACING_DIR[a.desk.facing];
}

/** Applies a (possibly repeated) logical status from the server. Idempotent. */
export function applyStatus(
  a: NpcActor,
  status: NpcStatus,
  tool: ToolCategory | undefined,
  env: NpcEnv,
): void {
  if (a.mode === 'gone' || a.mode === 'leaving') return;
  if (a.mode === 'arriving') {
    a.pending = { status, tool }; // applied once seated
    return;
  }
  if (a.mode === 'returning') {
    // Walking back to the desk: remember only the LATEST status, applied once seated.
    a.pending = { status, tool };
    a.tool = tool;
    return;
  }
  a.pending = null; // any other path supersedes a stale pending status
  a.tool = tool;

  if (status === 'awaiting') {
    if (a.mode === 'awaiting' || a.mode === 'goingToQueue' || a.mode === 'awaitingAtDesk') return;
    const slot = env.claimQueue(a.key);
    const dest = slot === null ? undefined : env.queueTiles[slot];
    if (slot === null || !dest) {
      // More than 8 waiting: the excess stays at the desk with the "!" (MAPA.md §4).
      a.queueSlot = null;
      if (walkTo(a, a.desk.tile, env)) {
        setMode(a, 'returning');
        a.pending = { status: 'awaiting', tool };
      } else {
        sitDown(a);
        setMode(a, 'awaitingAtDesk');
      }
      return;
    }
    a.queueSlot = slot;
    if (walkTo(a, dest, env)) setMode(a, 'goingToQueue');
    else {
      a.dir = 'w';
      setMode(a, 'awaiting');
    }
    return;
  }

  // Leaving the queue (decided, expired or no longer waiting).
  if (a.queueSlot !== null) {
    env.releaseQueue(a.key);
    a.queueSlot = null;
  }
  if (a.mode === 'awaitingAtDesk') setMode(a, 'atDesk');

  if (status === 'working') {
    if (a.mode === 'working' || a.mode === 'goingToWork') return;
    if (walkTo(a, a.desk.tile, env)) setMode(a, 'goingToWork');
    else {
      sitDown(a);
      setMode(a, 'working');
    }
    return;
  }

  // idle
  if (a.mode === 'working' || a.mode === 'goingToWork') {
    if (same(a.tile, a.desk.tile) && !a.path) {
      sitDown(a);
      setMode(a, env.reducedMotion ? 'atDesk' : 'celebrating');
    } else if (walkTo(a, a.desk.tile, env)) setMode(a, 'returning');
    else setMode(a, 'atDesk');
    a.idleMs = 0;
  } else if (a.mode === 'awaiting' || a.mode === 'goingToQueue') {
    if (walkTo(a, a.desk.tile, env)) setMode(a, 'returning');
    else {
      sitDown(a);
      setMode(a, 'atDesk');
    }
  }
}

/** Welcome scene (new agent) and Freelancer arrival: entrance -> counter (pause) -> desk. */
export function startArriving(a: NpcActor, env: NpcEnv): void {
  place(a, env.entrance);
  a.dir = 'n';
  a.stage = 0;
  a.pending = null;
  if (env.reducedMotion) {
    place(a, a.desk.tile);
    sitDown(a);
    setMode(a, 'atDesk');
    return;
  }
  setMode(a, 'arriving');
  if (!walkTo(a, env.counter, env)) a.stage = 1;
}

/** Changed their mind while walking out (back on the team): head back to the desk. */
export function startReturning(a: NpcActor, env: NpcEnv): void {
  if (a.mode !== 'leaving') return;
  if (walkTo(a, a.desk.tile, env)) setMode(a, 'returning');
  else {
    sitDown(a);
    setMode(a, 'atDesk');
  }
}

/** Farewell scene / Freelancer done: walk to the entrance and disappear. */
export function startLeaving(a: NpcActor, env: NpcEnv): void {
  if (a.mode === 'gone' || a.mode === 'leaving') return;
  if (a.queueSlot !== null) {
    env.releaseQueue(a.key);
    a.queueSlot = null;
  }
  a.pending = null;
  if (env.reducedMotion || !walkTo(a, env.entrance, env)) {
    place(a, env.entrance);
    setMode(a, 'gone');
    return;
  }
  setMode(a, 'leaving');
}

export function isWalking(a: NpcActor): boolean {
  return a.path !== null;
}

/** Advances along the path by `dtMs`; returns true on the step the path is finished. */
function advance(a: NpcActor, dtMs: number): boolean {
  const path = a.path;
  if (!path) return false;
  let dist = (WALK_SPEED_PX_S * dtMs) / 1000;
  while (dist > 0) {
    const from = path[a.segment] as Tile;
    const to = path[a.segment + 1];
    if (!to) break;
    a.dir = to[0] > from[0] ? 'e' : to[0] < from[0] ? 'w' : to[1] > from[1] ? 's' : 'n';
    const remaining = (1 - a.progress) * 16;
    if (dist >= remaining) {
      dist -= remaining;
      a.segment++;
      a.progress = 0;
      a.tile = to;
      if (a.segment >= path.length - 1) break;
    } else {
      a.progress += dist / 16;
      dist = 0;
    }
  }
  if (a.segment >= path.length - 1) {
    const last = path[path.length - 1] as Tile;
    place(a, last);
    return true;
  }
  const f = path[a.segment] as Tile;
  const t = path[a.segment + 1] as Tile;
  a.x = (f[0] + (t[0] - f[0]) * a.progress) * 16;
  a.y = (f[1] + (t[1] - f[1]) * a.progress) * 16;
  return false;
}

export function stepActor(a: NpcActor, dtMs: number, env: NpcEnv): void {
  a.modeMs += dtMs;
  a.animMs += dtMs;
  if (a.mode === 'atDesk') a.idleMs += dtMs;
  else a.idleMs = 0;

  if (a.path) {
    if (!advance(a, dtMs)) return;
    // Arrived.
    switch (a.mode) {
      case 'goingToWork':
        sitDown(a);
        setMode(a, 'working');
        break;
      case 'goingToQueue':
        a.dir = 'w';
        setMode(a, 'awaiting');
        break;
      case 'returning':
        sitDown(a);
        setMode(a, 'atDesk');
        flushPending(a, env);
        break;
      case 'leaving':
        setMode(a, 'gone');
        break;
      case 'arriving':
        if (a.stage === 0) {
          a.stage = 1;
          a.dir = 's';
          a.modeMs = 0;
        } else {
          sitDown(a);
          setMode(a, 'atDesk');
          flushPending(a, env);
        }
        break;
      default:
        break;
    }
    return;
  }

  if (a.mode === 'celebrating' && a.modeMs >= CELEBRATE_MS) setMode(a, 'atDesk');
  if (a.mode === 'arriving' && a.stage === 1 && a.modeMs >= WELCOME_PAUSE_MS) {
    a.stage = 2;
    if (!walkTo(a, a.desk.tile, env)) {
      sitDown(a);
      setMode(a, 'atDesk');
      flushPending(a, env);
    }
  }
}

function flushPending(a: NpcActor, env: NpcEnv): void {
  const p = a.pending;
  a.pending = null;
  if (p) applyStatus(a, p.status, p.tool, env);
}

// --- Presentation ---------------------------------------------------------------------------

export interface NpcPose {
  anim: NpcAnim;
  dir: NpcDir;
  frame: number;
  /** Vertical hop in px (celebrating), negative = up. */
  hop: number;
  icon: StatusIcon;
  /** Icon bounce in px (the "!" jumps, GUIA-VISUAL §6). */
  iconBob: number;
}

export function animForTool(tool: ToolCategory | undefined): 'type' | 'read' {
  // edit -> typing; read/web -> reading (book); bash -> typing + terminal glow (object, later);
  // delegate/task/plan/other -> typing.
  return tool === 'read' || tool === 'web' ? 'read' : 'type';
}

export function poseOf(a: NpcActor, reducedMotion: boolean): NpcPose {
  let anim: NpcAnim;
  let frame = 0;
  let hop = 0;
  let icon: StatusIcon = null;
  let iconBob = 0;

  if (a.path) {
    anim = 'walk';
    frame = Math.floor(a.animMs / 150) % 4;
  } else {
    switch (a.mode) {
      case 'working':
        anim = animForTool(a.tool);
        frame = reducedMotion ? 0 : Math.floor(a.animMs / (anim === 'type' ? 250 : 500)) % 2;
        break;
      case 'awaiting':
        anim = 'idle';
        frame = reducedMotion ? 0 : Math.floor(a.animMs / 800) % 2;
        break;
      case 'celebrating':
        anim = 'idle';
        hop = reducedMotion ? 0 : -Math.round(Math.abs(Math.sin(a.modeMs / 120)) * 4);
        break;
      case 'arriving':
      case 'leaving':
        anim = 'idle';
        break;
      case 'atDesk':
      case 'awaitingAtDesk':
      case 'goingToWork':
      case 'goingToQueue':
      case 'returning':
      default:
        anim = 'sit';
    }
  }
  if (a.mode === 'working' || a.mode === 'goingToWork') icon = 'gear';
  else if (a.mode === 'awaiting' || a.mode === 'awaitingAtDesk' || a.mode === 'goingToQueue')
    icon = 'alert';
  else if (a.mode === 'atDesk' && a.idleMs >= SLEEPY_AFTER_MS) icon = 'zzz';
  if (icon === 'alert' && !reducedMotion)
    iconBob = -(BOB_STEPS[Math.floor(a.animMs / 150) % 4] ?? 0);
  return { anim, dir: a.dir, frame, hop, icon, iconBob };
}

/** Text key for the status icon (screen readers and cards; never colour or icon alone). */
export function statusTextKey(
  a: Pick<NpcActor, 'mode' | 'idleMs'> | null,
  logical: NpcStatus,
): 'working' | 'awaiting' | 'sleepy' | 'idle' {
  if (logical === 'working') return 'working';
  if (logical === 'awaiting') return 'awaiting';
  return a && a.idleMs >= SLEEPY_AFTER_MS ? 'sleepy' : 'idle';
}
