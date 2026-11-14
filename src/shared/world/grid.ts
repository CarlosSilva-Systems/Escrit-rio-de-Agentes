// Walkability grid (ARQUITETURA §7.2). Pure and DOM-free: shared by the engine, the demo
// walkers and the tests. `collision` in mapa.json is a base64 bitset, 1 = blocked, row-major,
// least significant bit first inside each byte (bit y*cols+x lives in byte i>>3, mask 1<<(i&7)).

export type Tile = readonly [number, number];

export interface Grid {
  readonly cols: number;
  readonly rows: number;
  /** 1 = blocked. Row-major, one byte per cell (decoded form). */
  readonly blocked: Uint8Array;
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** Decodes the mapa/v1 collision bitset. Missing bytes are treated as walkable. */
export function decodeCollision(b64: string, cols: number, rows: number): Grid {
  const bytes = base64ToBytes(b64);
  const blocked = new Uint8Array(cols * rows);
  for (let i = 0; i < blocked.length; i++) {
    const byte = bytes[i >> 3] ?? 0;
    blocked[i] = (byte >> (i & 7)) & 1;
  }
  return { cols, rows, blocked };
}

/** Inverse of {@link decodeCollision}. */
export function encodeCollision(grid: Grid): string {
  const bytes = new Uint8Array(Math.ceil((grid.cols * grid.rows) / 8));
  for (let i = 0; i < grid.blocked.length; i++) {
    if (grid.blocked[i]) bytes[i >> 3] = (bytes[i >> 3] ?? 0) | (1 << (i & 7));
  }
  return bytesToBase64(bytes);
}

export function createGrid(cols: number, rows: number, fillBlocked = false): Grid {
  return { cols, rows, blocked: new Uint8Array(cols * rows).fill(fillBlocked ? 1 : 0) };
}

export function inBounds(grid: Grid, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < grid.cols && y < grid.rows;
}

/** Out-of-bounds cells count as blocked. */
export function isBlocked(grid: Grid, x: number, y: number): boolean {
  return !inBounds(grid, x, y) || grid.blocked[y * grid.cols + x] === 1;
}

export function setBlocked(grid: Grid, x: number, y: number, value: boolean): void {
  if (inBounds(grid, x, y)) grid.blocked[y * grid.cols + x] = value ? 1 : 0;
}

/** Fills an inclusive rect `[x1, y1, x2, y2]`. */
export function fillRect(
  grid: Grid,
  rect: readonly [number, number, number, number],
  value: boolean,
): void {
  const [x1, y1, x2, y2] = rect;
  for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) setBlocked(grid, x, y, value);
}

const FOUR_NEIGHBORS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/** All walkable tiles reachable from `start` (4-neighbour flood fill), as `y * cols + x`. */
export function floodFill(grid: Grid, start: Tile): Set<number> {
  const seen = new Set<number>();
  if (isBlocked(grid, start[0], start[1])) return seen;
  const first = start[1] * grid.cols + start[0];
  const stack = [first];
  seen.add(first);
  while (stack.length > 0) {
    const idx = stack.pop() as number;
    const x = idx % grid.cols;
    const y = (idx - x) / grid.cols;
    for (const [dx, dy] of FOUR_NEIGHBORS) {
      const nx = x + dx;
      const ny = y + dy;
      if (isBlocked(grid, nx, ny)) continue;
      const n = ny * grid.cols + nx;
      if (!seen.has(n)) {
        seen.add(n);
        stack.push(n);
      }
    }
  }
  return seen;
}
