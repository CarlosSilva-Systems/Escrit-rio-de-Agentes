import { describe, expect, it } from 'vitest';
import {
  createGrid,
  decodeCollision,
  encodeCollision,
  fillRect,
  floodFill,
  isBlocked,
} from './grid';
import { findPath, PathCache } from './pathfinding';

describe('grid', () => {
  it('CA-11: collision bitset round-trips (base64, LSB first)', () => {
    const grid = createGrid(8, 6);
    fillRect(grid, [1, 1, 3, 2], true);
    fillRect(grid, [7, 5, 7, 5], true);
    const decoded = decodeCollision(encodeCollision(grid), 8, 6);
    expect([...decoded.blocked]).toEqual([...grid.blocked]);
    expect(isBlocked(decoded, 2, 2)).toBe(true);
    expect(isBlocked(decoded, 0, 0)).toBe(false);
    expect(isBlocked(decoded, -1, 0)).toBe(true);
    expect(isBlocked(decoded, 8, 0)).toBe(true);
  });

  it('CA-11: flood fill stops at walls', () => {
    const grid = createGrid(5, 3);
    fillRect(grid, [2, 0, 2, 2], true);
    expect(floodFill(grid, [0, 0]).size).toBe(6);
    expect(floodFill(grid, [2, 0]).size).toBe(0);
  });
});

describe('findPath (A*)', () => {
  it('CA-11: finds a shortest 4-connected path including both endpoints', () => {
    const grid = createGrid(6, 6);
    const path = findPath(grid, [0, 0], [3, 2]);
    expect(path).not.toBeNull();
    expect(path?.length).toBe(1 + 3 + 2);
    expect(path?.[0]).toEqual([0, 0]);
    expect(path?.at(-1)).toEqual([3, 2]);
    for (let i = 1; i < (path?.length ?? 0); i++) {
      const [ax, ay] = path?.[i - 1] as [number, number];
      const [bx, by] = path?.[i] as [number, number];
      expect(Math.abs(ax - bx) + Math.abs(ay - by)).toBe(1);
    }
  });

  it('CA-11: routes around walls through the only door', () => {
    // Wall at x=3 with a door at y=4.
    const grid = createGrid(7, 6);
    fillRect(grid, [3, 0, 3, 5], true);
    fillRect(grid, [3, 4, 3, 4], false);
    const path = findPath(grid, [1, 1], [5, 1]);
    expect(path).not.toBeNull();
    expect(path?.some(([x, y]) => x === 3 && y === 4)).toBe(true);
    expect(path?.every(([x, y]) => !isBlocked(grid, x, y))).toBe(true);
  });

  it('CA-11: returns null when the goal is walled off or blocked', () => {
    const grid = createGrid(5, 5);
    fillRect(grid, [2, 0, 2, 4], true);
    expect(findPath(grid, [0, 0], [4, 0])).toBeNull();
    expect(findPath(grid, [0, 0], [2, 2])).toBeNull();
    expect(findPath(grid, [0, 0], [9, 9])).toBeNull();
  });

  it('CA-11: allows a blocked goal (chair tile) and a blocked start only when asked', () => {
    const grid = createGrid(4, 1);
    fillRect(grid, [3, 0, 3, 0], true);
    expect(findPath(grid, [0, 0], [3, 0])).toBeNull();
    expect(findPath(grid, [0, 0], [3, 0], { allowBlockedGoal: true })).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
    ]);
    // Leaving a blocked start tile is always possible.
    expect(findPath(grid, [3, 0], [0, 0])?.length).toBe(4);
  });

  it('CA-11: start equal to goal is a one-tile path', () => {
    expect(findPath(createGrid(3, 3), [1, 1], [1, 1])).toEqual([[1, 1]]);
  });

  it('CA-65: is deterministic for the same query', () => {
    const grid = createGrid(20, 20);
    fillRect(grid, [5, 2, 5, 17], true);
    const a = findPath(grid, [1, 10], [18, 10]);
    const b = findPath(grid, [1, 10], [18, 10]);
    expect(a).toEqual(b);
  });

  it('CA-08: solves a worst-case route on the 64x52 floor fast', () => {
    const grid = createGrid(64, 52);
    // Serpentine walls force a long detour.
    for (let x = 4; x < 64; x += 8) fillRect(grid, [x, 0, x, 47], true);
    for (let x = 8; x < 64; x += 8) fillRect(grid, [x, 4, x, 51], true);
    const t0 = performance.now();
    const path = findPath(grid, [0, 0], [63, 51]);
    const elapsed = performance.now() - t0;
    expect(path).not.toBeNull();
    expect(elapsed).toBeLessThan(50);
  });
});

describe('PathCache', () => {
  it('CA-08: returns the cached path and evicts the oldest entry', () => {
    const grid = createGrid(10, 10);
    const cache = new PathCache(grid, 2);
    const a = cache.find([0, 0], [5, 5]);
    expect(cache.find([0, 0], [5, 5])).toBe(a);
    cache.find([1, 1], [2, 2]);
    cache.find([3, 3], [4, 4]); // evicts [0,0]>[5,5]
    expect(cache.find([0, 0], [5, 5])).not.toBe(a);
    expect(cache.find([0, 0], [5, 5])).toEqual(a);
  });
});
