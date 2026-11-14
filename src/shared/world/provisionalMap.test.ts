import { describe, expect, it } from 'vitest';
import { MapaSchema } from '../contracts/mapa';
import { decodeCollision, floodFill, isBlocked } from './grid';
import { findPath } from './pathfinding';
import { deriveCollision, deriveLayers } from './layers';
import { buildProvisionalMap } from './provisionalMap';
import { TILE } from './tileIds';

const map = buildProvisionalMap();
const grid = decodeCollision(map.collision, map.cols, map.rows);

describe('provisional map (MAPA.md transcription)', () => {
  it('CA-11: validates against the mapa/v1 contract at 64x52', () => {
    const parsed = MapaSchema.safeParse(map);
    expect(parsed.success ? [] : parsed.error.issues).toEqual([]);
    expect(map.cols).toBe(64);
    expect(map.rows).toBe(52);
  });

  it('CA-11: has every fixed room of the floor plan and 4 project slots', () => {
    const ids = new Set(map.rooms.map((r) => r.id));
    for (const id of [
      'DIR',
      'REU',
      'PLN',
      'ENG',
      'QUA',
      'SOC',
      'COR1',
      'COR2',
      'COR3',
      'ENT',
      'BIB',
      'REC',
      'COP',
      'WC',
      'TER',
      'SRV',
      'PRJ1',
      'PRJ2',
      'PRJ3',
      'PRJ4',
    ]) {
      expect(ids.has(id), id).toBe(true);
    }
    expect(map.projectSlots.map((p) => p.slot)).toEqual([0, 1, 2, 3]);
  });

  it('CA-11: every desk seat, seat, POI tile and approval-queue tile is reachable from the entrance', () => {
    const door = map.doors.find((d) => d.id === 'DR-ENTRADA');
    const start = door?.tiles[0] as [number, number];
    expect(isBlocked(grid, start[0], start[1])).toBe(false);
    const reachable = floodFill(grid, start);
    const unreachable: string[] = [];
    const check = (id: string, [x, y]: readonly [number, number]) => {
      if (isBlocked(grid, x, y) || !reachable.has(y * map.cols + x))
        unreachable.push(`${id}@${x},${y}`);
    };
    for (const d of map.desks) check(d.id, d.seat);
    for (const s of map.seats) check(s.id, s.tile);
    for (const p of map.pois) for (const t of p.tiles) check(p.id, t);
    expect(unreachable).toEqual([]);
  });

  it('CA-11: the 2 north rows of each room (the wall face) are not walkable except at doors', () => {
    expect(isBlocked(grid, 5, 1)).toBe(true); // DIR face
    expect(isBlocked(grid, 5, 2)).toBe(true);
    expect(isBlocked(grid, 5, 3)).toBe(false);
    expect(isBlocked(grid, 13, 15)).toBe(false); // DR-ENG-N crosses the face
  });

  it('CA-11: a worst-case walk (entrance to the SOC console) is found fast', () => {
    const t0 = performance.now();
    const path = findPath(grid, [8, 50], [50, 17], { allowBlockedGoal: true });
    expect(path).not.toBeNull();
    expect(performance.now() - t0).toBeLessThan(50);
  });

  it('CA-43: the four project rooms have their own light zones that default to off (activity)', () => {
    const modes = new Map(map.lightZones.map((z) => [z.id, z.mode]));
    for (let n = 1; n <= 4; n++) expect(modes.get(`ZL-PRJ${n}`)).toBe('activity');
  });

  it('CA-11: derived collision matches the encoded bitset and layers cover the floor', () => {
    expect([...deriveCollision(map).blocked]).toEqual([...grid.blocked]);
    const layers = deriveLayers(map);
    expect(layers.floor).toHaveLength(64 * 52);
    expect(layers.walls[1 * 64 + 5]).toBe(TILE.FACE_UPPER);
    expect(layers.walls[2 * 64 + 5]).toBe(TILE.FACE_LOWER);
    expect(layers.walls[0]).toBe(TILE.WALL_TOP);
    expect(layers.walls[43 * 64 + 54]).toBe(TILE.GLASS);
  });
});
