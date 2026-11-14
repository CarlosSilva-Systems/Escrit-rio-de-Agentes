// A* on the office grid (ARQUITETURA §7.2): 4 directions, Manhattan heuristic, binary heap.
// Deterministic: ties are broken by heuristic, so the same query always returns the same path
// (needed for seeded NPC simulation tests).

import type { Grid, Tile } from './grid';
import { inBounds, isBlocked } from './grid';

export interface FindPathOptions {
  /** Accept a blocked goal tile (e.g. a chair tile the map marks as blocked). */
  allowBlockedGoal?: boolean;
  /** Safety valve: give up after expanding this many nodes (the grid has 3 328 cells). */
  maxExpansions?: number;
}

class MinHeap {
  private readonly keys: number[] = [];
  private readonly values: number[] = [];

  get size(): number {
    return this.keys.length;
  }

  push(key: number, value: number): void {
    const keys = this.keys;
    const values = this.values;
    let i = keys.length;
    keys.push(key);
    values.push(value);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if ((keys[parent] as number) <= key) break;
      keys[i] = keys[parent] as number;
      values[i] = values[parent] as number;
      i = parent;
    }
    keys[i] = key;
    values[i] = value;
  }

  pop(): number {
    const keys = this.keys;
    const values = this.values;
    const top = values[0] as number;
    const lastKey = keys.pop() as number;
    const lastValue = values.pop() as number;
    const n = keys.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        let child = 2 * i + 1;
        if (child >= n) break;
        if (child + 1 < n && (keys[child + 1] as number) < (keys[child] as number)) child++;
        if ((keys[child] as number) >= lastKey) break;
        keys[i] = keys[child] as number;
        values[i] = values[child] as number;
        i = child;
      }
      keys[i] = lastKey;
      values[i] = lastValue;
    }
    return top;
  }
}

const NEIGHBORS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
] as const;

/**
 * Shortest 4-connected path including both endpoints, or `null` when there is none.
 * Start == goal returns `[start]`. The start tile is always allowed even when blocked
 * (an NPC standing on a chair tile must be able to leave it).
 */
export function findPath(
  grid: Grid,
  start: Tile,
  goal: Tile,
  options: FindPathOptions = {},
): Tile[] | null {
  const [sx, sy] = start;
  const [gx, gy] = goal;
  if (!inBounds(grid, sx, sy) || !inBounds(grid, gx, gy)) return null;
  const goalBlocked = isBlocked(grid, gx, gy);
  if (goalBlocked && !options.allowBlockedGoal) return null;
  if (sx === gx && sy === gy) return [[sx, sy]];

  const { cols } = grid;
  const total = grid.cols * grid.rows;
  const maxExpansions = options.maxExpansions ?? total * 2;
  const g = new Float64Array(total).fill(Infinity);
  const parent = new Int32Array(total).fill(-1);
  const closed = new Uint8Array(total);
  const open = new MinHeap();

  const h = (x: number, y: number) => Math.abs(x - gx) + Math.abs(y - gy);
  const startIdx = sy * cols + sx;
  const goalIdx = gy * cols + gx;
  g[startIdx] = 0;
  // key = f * 4096 + h keeps f as the primary order and h as the tie-breaker.
  open.push(h(sx, sy) * 4096 + h(sx, sy), startIdx);

  let expansions = 0;
  while (open.size > 0 && expansions < maxExpansions) {
    const idx = open.pop();
    if (closed[idx]) continue;
    closed[idx] = 1;
    expansions++;
    if (idx === goalIdx) {
      const path: Tile[] = [];
      for (let cur = idx; cur !== -1; cur = parent[cur] as number) {
        const x = cur % cols;
        path.push([x, (cur - x) / cols]);
      }
      return path.reverse();
    }
    const x = idx % cols;
    const y = (idx - x) / cols;
    const gCur = g[idx] as number;
    for (const [dx, dy] of NEIGHBORS) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inBounds(grid, nx, ny)) continue;
      const nIdx = ny * cols + nx;
      if (closed[nIdx]) continue;
      if (isBlocked(grid, nx, ny) && nIdx !== goalIdx) continue;
      const tentative = gCur + 1;
      if (tentative < (g[nIdx] as number)) {
        g[nIdx] = tentative;
        parent[nIdx] = idx;
        const hn = h(nx, ny);
        open.push((tentative + hn) * 4096 + hn, nIdx);
      }
    }
  }
  return null;
}

/** Small LRU for desk <-> POI routes (the same few queries repeat all day). */
export class PathCache {
  private readonly map = new Map<string, Tile[] | null>();

  constructor(
    private readonly grid: Grid,
    private readonly capacity = 256,
  ) {}

  find(start: Tile, goal: Tile, options?: FindPathOptions): Tile[] | null {
    const key = `${start[0]},${start[1]}>${goal[0]},${goal[1]}${options?.allowBlockedGoal ? '!' : ''}`;
    if (this.map.has(key)) {
      const hit = this.map.get(key) as Tile[] | null;
      this.map.delete(key);
      this.map.set(key, hit);
      return hit;
    }
    const path = findPath(this.grid, start, goal, options);
    this.map.set(key, path);
    if (this.map.size > this.capacity) {
      const oldest = this.map.keys().next().value as string;
      this.map.delete(oldest);
    }
    return path;
  }

  clear(): void {
    this.map.clear();
  }
}
