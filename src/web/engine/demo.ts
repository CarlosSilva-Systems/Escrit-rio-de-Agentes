// Demo walkers: N characters that wander the office along A* paths. Used by the S-02 render spike
// and by `?demo=N` to exercise the engine before the real NPC state machine exists (next block).
// Deterministic (seeded RNG) so measurements are repeatable.

import type { Mapa } from '../../shared/contracts/mapa';
import type { Tile } from '../../shared/world/grid';
import { PathCache } from '../../shared/world/pathfinding';
import { TEAM_SPECS, type Anim, type Dir } from './art/characters';
import { characterSprite, type SpriteInstance } from './sprites';
import type { World } from './world/world';

/** 48 px/s = 3 tiles/s (ARQUITETURA §7.2). */
export const WALK_SPEED_PX_S = 48;

export interface Simulation {
  update(dtMs: number): void;
  sprites(): SpriteInstance[];
  /** True while anything is walking (drives the adaptive frame rate). */
  moving(): boolean;
  /** How many things are walking right now (drives 20 vs 30 fps). */
  movingCount?(): number;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Walker {
  id: string;
  key: string;
  x: number;
  y: number;
  tile: Tile;
  path: Tile[] | null;
  segment: number;
  progress: number; // 0..1 along the current segment
  dir: Dir | 'w';
  anim: Anim;
  animMs: number;
  pauseMs: number;
  seated: boolean;
}

type Target = { tile: Tile; facing?: Mapa['seats'][number]['facing']; seat: boolean };

function collectTargets(world: World): Target[] {
  const { map } = world;
  const targets: Target[] = [];
  for (const d of map.desks)
    targets.push({ tile: [d.seat[0], d.seat[1]], facing: d.facing, seat: true });
  for (const s of map.seats)
    targets.push({ tile: [s.tile[0], s.tile[1]], facing: s.facing, seat: true });
  for (const p of map.pois) {
    if (p.id.startsWith('FILA') || p.kind === 'bathroom-door') continue;
    for (const t of p.tiles) targets.push({ tile: [t[0], t[1]], seat: false });
  }
  return targets;
}

const FACING_DIR: Record<string, Dir | 'w'> = { south: 's', north: 'n', east: 'e', west: 'w' };

export function createDemoWalkers(
  world: World,
  count: number,
  options: { seed?: number; pauseMs?: [number, number] } = {},
): Simulation {
  const rng = mulberry32(options.seed ?? 1);
  const pause = options.pauseMs ?? [400, 2500];
  const targets = collectTargets(world);
  const cache = new PathCache(world.grid, 512);
  const randRange = (lo: number, hi: number) => lo + rng() * (hi - lo);

  const walkers: Walker[] = [];
  for (let i = 0; i < count; i++) {
    const start = targets[Math.floor(rng() * targets.length)] as Target;
    const spec = TEAM_SPECS[i % TEAM_SPECS.length];
    walkers.push({
      id: `demo-${i}`,
      key: spec?.key ?? 'npc-livia',
      x: start.tile[0] * 16,
      y: start.tile[1] * 16,
      tile: start.tile,
      path: null,
      segment: 0,
      progress: 0,
      dir: 's',
      anim: 'idle',
      animMs: Math.floor(rng() * 1000),
      pauseMs: Math.floor(randRange(0, pause[1])),
      seated: false,
    });
  }

  const chooseNext = (w: Walker) => {
    for (let attempt = 0; attempt < 8; attempt++) {
      const target = targets[Math.floor(rng() * targets.length)] as Target;
      if (target.tile[0] === w.tile[0] && target.tile[1] === w.tile[1]) continue;
      const path = cache.find(w.tile, target.tile, { allowBlockedGoal: true });
      if (path && path.length > 1) {
        w.path = path;
        w.segment = 0;
        w.progress = 0;
        w.seated = false;
        w.anim = 'walk';
        return;
      }
    }
    w.pauseMs = 500; // nothing reachable this time; try again shortly
  };

  const arrive = (w: Walker) => {
    const last = w.path?.[w.path.length - 1] as Tile;
    w.tile = last;
    w.x = last[0] * 16;
    w.y = last[1] * 16;
    w.path = null;
    const target = targets.find((t) => t.tile[0] === last[0] && t.tile[1] === last[1]);
    w.pauseMs = randRange(pause[0], pause[1]);
    if (target?.seat) {
      w.seated = true;
      w.dir = FACING_DIR[target.facing ?? 'south'] ?? 's';
      w.anim = rng() < 0.7 ? 'type' : 'sit';
    } else {
      w.seated = false;
      w.anim = 'idle';
    }
  };

  const frameFor = (w: Walker): number => {
    switch (w.anim) {
      case 'walk':
        return Math.floor(w.animMs / 150) % 4;
      case 'idle':
        return Math.floor(w.animMs / 800) % 2;
      case 'type':
        return Math.floor(w.animMs / 250) % 2;
      case 'read':
        return Math.floor(w.animMs / 500) % 2;
      default:
        return 0;
    }
  };

  return {
    update(dtMs) {
      for (const w of walkers) {
        w.animMs += dtMs;
        if (w.path) {
          let dist = (WALK_SPEED_PX_S * dtMs) / 1000;
          while (dist > 0 && w.path) {
            const from = w.path[w.segment] as Tile;
            const to = w.path[w.segment + 1];
            if (!to) {
              arrive(w);
              break;
            }
            const dx = to[0] - from[0];
            const dy = to[1] - from[1];
            w.dir = dx > 0 ? 'e' : dx < 0 ? 'w' : dy > 0 ? 's' : 'n';
            const remaining = (1 - w.progress) * 16;
            if (dist >= remaining) {
              dist -= remaining;
              w.segment++;
              w.progress = 0;
              w.tile = to;
              if (w.segment >= w.path.length - 1) {
                arrive(w);
                break;
              }
            } else {
              w.progress += dist / 16;
              dist = 0;
            }
            if (w.path) {
              const f = w.path[w.segment] as Tile;
              const t = w.path[w.segment + 1] ?? f;
              w.x = (f[0] + (t[0] - f[0]) * w.progress) * 16;
              w.y = (f[1] + (t[1] - f[1]) * w.progress) * 16;
            }
          }
        } else {
          w.pauseMs -= dtMs;
          if (w.pauseMs <= 0) chooseNext(w);
        }
      }
    },
    sprites() {
      return walkers.map((w) => characterSprite(w.id, w.key, w.anim, w.dir, frameFor(w), w.x, w.y));
    },
    moving() {
      return walkers.some((w) => w.path !== null);
    },
    movingCount() {
      return walkers.filter((w) => w.path !== null).length;
    },
  };
}
