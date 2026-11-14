import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MapaSchema } from '../../../shared/contracts/mapa';
import { isBlocked } from '../../../shared/world/grid';
import { findPath } from '../../../shared/world/pathfinding';
import { buildProvisionalMap } from '../../../shared/world/provisionalMap';
import { canonicalSprite } from '../../../shared/world/spriteAliases';
import { isKnownFurniture } from '../art/furniture';
import type { Atlas, Frame } from '../atlas';
import { createDemoWalkers, mulberry32, WALK_SPEED_PX_S } from '../demo';
import { createWorld, roomAt, roomCameraPoint } from './world';

const stubFrame: Frame = {
  source: {} as CanvasImageSource,
  sx: 0,
  sy: 0,
  sw: 16,
  sh: 16,
  ax: 0,
  ay: 0,
};
const stubAtlas: Atlas = { providesTiles: false, frame: () => stubFrame, tile: () => undefined };

const provisional = buildProvisionalMap();
const world = createWorld(provisional, stubAtlas, true);

describe('world model', () => {
  it('CA-11: sizes, room lookup and the camera point of each room', () => {
    expect(world.widthPx).toBe(1024);
    expect(world.heightPx).toBe(832);
    expect(roomAt(world, 9, 5)?.id).toBe('DIR');
    expect(roomAt(world, 30, 20)?.id).toBe('QUA');
    expect(roomAt(world, 0, 0)).toBeUndefined();
    expect(roomAt(world, -3, 4)).toBeUndefined();
    expect(roomCameraPoint(world, 'PRJ1')).toEqual({ x: (4 + 0.5) * 16, y: (33 + 0.5) * 16 });
    expect(roomCameraPoint(world, 'COR1')).toBeNull();
  });

  it('CA-11: furniture is y-sorted and rugs are static, not sorted per frame', () => {
    const keys = world.sortables.map((s) => s.sortY);
    expect([...keys].sort((a, b) => a - b)).toEqual(keys);
    expect(world.statics.length).toBeGreaterThan(10);
    expect(world.statics[0]?.layer).toBe(0); // rugs first
  });

  it('CA-43: every light zone resolves to pixel rects', () => {
    for (const zone of provisional.lightZones) {
      expect(world.zoneRects.get(zone.id)?.length, zone.id).toBeGreaterThan(0);
    }
  });

  it('CA-11: an unknown sprite is reported, never thrown', () => {
    const withUnknown = {
      ...provisional,
      objects: [
        ...provisional.objects,
        {
          id: 'x',
          sprite: 'props/nope',
          tile: [3, 3] as [number, number],
          footprint: [1, 1] as [number, number],
        },
      ],
    };
    const noArt: Atlas = { providesTiles: false, frame: () => undefined, tile: () => undefined };
    const w = createWorld(withUnknown, noArt, true);
    expect(w.diagnostics.some((d) => d.includes('props/nope'))).toBe(true);
    expect(w.sortables).toHaveLength(0);
  });
});

describe('designer map (assets/map/mapa.json)', () => {
  const file = join(process.cwd(), 'assets', 'map', 'mapa.json');
  const present = existsSync(file);

  it.skipIf(!present)('CA-11: validates and every sprite name has built-in placeholder art', () => {
    const parsed = MapaSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')));
    expect(parsed.success ? [] : parsed.error.issues).toEqual([]);
    if (!parsed.success) return;
    const missing = [...new Set(parsed.data.objects.map((o) => o.sprite))].filter(
      (s) => !isKnownFurniture(canonicalSprite(s)),
    );
    expect(missing).toEqual([]);
  });

  it.skipIf(!present)('CA-11: the real floor plan loads into a world without diagnostics', () => {
    const parsed = MapaSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
    const w = createWorld(parsed, stubAtlas, false);
    expect(w.diagnostics).toEqual([]);
    expect(w.placeholderTiles).toBe(true);
    expect(w.layers.floor).toHaveLength(parsed.cols * parsed.rows);
  });
});

describe('designer map walkability (LSB-first bitset)', () => {
  const file = join(process.cwd(), 'assets', 'map', 'mapa.json');
  it.skipIf(!existsSync(file))(
    'CA-11: every desk seat is reachable from the entrance with A*',
    () => {
      const map = MapaSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
      const w = createWorld(map, stubAtlas, false);
      const door = map.doors.find((d) => d.id === map.spawn.entrance);
      const start = door?.tiles[0] as [number, number];
      expect(isBlocked(w.grid, start[0], start[1])).toBe(false);
      const unreachable = map.desks.filter(
        (d) => !findPath(w.grid, start, [d.seat[0], d.seat[1]], { allowBlockedGoal: true }),
      );
      expect(unreachable.map((d) => d.id)).toEqual([]);
    },
  );
});

describe('demo walkers (S-02 scene)', () => {
  it('CA-65: the same seed gives the same walk, a different seed a different one', () => {
    const run = (seed: number) => {
      const sim = createDemoWalkers(world, 6, { seed, pauseMs: [100, 300] });
      for (let i = 0; i < 300; i++) sim.update(33);
      return sim
        .sprites()
        .map((s) => `${s.id}@${Math.round(s.x)},${Math.round(s.y)}:${s.frameName}`)
        .join('|');
    };
    expect(run(5)).toBe(run(5));
    expect(run(5)).not.toBe(run(6));
  });

  it('CA-08: 20 walkers only ever stand on walkable tiles (or seats) and never move faster than 48 px/s', () => {
    const sim = createDemoWalkers(world, 20, { seed: 1, pauseMs: [50, 200] });
    let previous = new Map(sim.sprites().map((s) => [s.id, { x: s.x, y: s.y }]));
    let sawMoving = false;
    for (let i = 0; i < 1800; i++) {
      sim.update(33);
      if (sim.moving()) sawMoving = true;
      for (const s of sim.sprites()) {
        const tx = Math.round(s.x / 16);
        const ty = Math.round(s.y / 16);
        expect(isBlocked(world.grid, tx, ty), `${s.id} on blocked tile ${tx},${ty}`).toBe(false);
        const prev = previous.get(s.id) as { x: number; y: number };
        expect(Math.hypot(s.x - prev.x, s.y - prev.y)).toBeLessThanOrEqual(
          (WALK_SPEED_PX_S * 33) / 1000 + 0.01,
        );
      }
      previous = new Map(sim.sprites().map((s) => [s.id, { x: s.x, y: s.y }]));
    }
    expect(sawMoving).toBe(true);
  });

  it('CA-07: a clamped dt keeps a resumed tab from teleporting anyone', () => {
    const sim = createDemoWalkers(world, 4, { seed: 2, pauseMs: [50, 100] });
    for (let i = 0; i < 100; i++) sim.update(33);
    const before = sim.sprites().map((s) => ({ x: s.x, y: s.y }));
    sim.update(100); // the loop never hands over more than 100 ms
    const after = sim.sprites();
    after.forEach((s, i) =>
      expect(
        Math.hypot(s.x - (before[i] as { x: number }).x, s.y - (before[i] as { y: number }).y),
      ).toBeLessThanOrEqual(5),
    );
  });

  it('CA-65: the RNG is deterministic and well spread', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const values = Array.from({ length: 100 }, () => a());
    expect(values).toEqual(Array.from({ length: 100 }, () => b()));
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...values)).toBeLessThan(1);
    expect(new Set(values).size).toBe(100);
  });
});
