// Derives tile layers and the walkability bitset from the rooms/doors/objects of a mapa/v1
// document. Used (a) to build the provisional map and (b) as the fallback look when the tileset
// image named by a real mapa.json is not available (placeholder art, ASSETS.md).

import type { Mapa } from '../contracts/mapa';
import { createGrid, encodeCollision, fillRect, setBlocked, type Grid } from './grid';
import { canonicalSprite } from './spriteAliases';
import { TILE } from './tileIds';

export type DerivedLayers = Mapa['layers'];

/** Sprites that never block movement (the NPC walks or sits on them). */
export function isWalkThroughSprite(sprite: string): boolean {
  const name = canonicalSprite(sprite);
  return /^(rug|face|flat)\//.test(name) || name.startsWith('furn/chair');
}

/** Sprites painted into the cached static layer (no y-sorting against NPCs). */
export function isStaticSprite(sprite: string): boolean {
  return /^(rug|face|flat)\//.test(canonicalSprite(sprite));
}

const CORRIDOR_KINDS = new Set(['corredor', 'passagem']);

/** Index of the room covering each cell (0 = none, otherwise index + 1). */
export function buildRoomIndex(map: Mapa): Uint16Array {
  const index = new Uint16Array(map.cols * map.rows);
  map.rooms.forEach((room, i) => {
    for (const [x1, y1, x2, y2] of room.rects) {
      for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) index[y * map.cols + x] = i + 1;
    }
  });
  return index;
}

function isFaceRow(map: Mapa, roomIdx: number, y: number): boolean {
  const room = map.rooms[roomIdx];
  if (!room || CORRIDOR_KINDS.has(room.kind)) return false;
  const faceRows = room.faceRows ?? 2;
  return room.rects.some(([, y1]) => y >= y1 && y < y1 + faceRows);
}

/** Walkability from rooms (minus face rows), doors and solid objects. */
export function deriveCollision(map: Mapa): Grid {
  const grid = createGrid(map.cols, map.rows, true);
  const roomIndex = buildRoomIndex(map);
  for (let y = 0; y < map.rows; y++) {
    for (let x = 0; x < map.cols; x++) {
      const ri = (roomIndex[y * map.cols + x] ?? 0) - 1;
      if (ri >= 0 && !isFaceRow(map, ri, y)) setBlocked(grid, x, y, false);
    }
  }
  for (const door of map.doors) for (const [x, y] of door.tiles) setBlocked(grid, x, y, false);
  for (const desk of map.desks) if (desk.table) fillRect(grid, desk.table, true);
  for (const obj of map.objects) {
    if (isWalkThroughSprite(obj.sprite)) continue;
    const [x, y] = obj.tile;
    const [w, h] = obj.footprint;
    fillRect(grid, [x, y, x + w - 1, y + h - 1], true);
  }
  // A seat is always standable, even if a table rect touches it.
  for (const desk of map.desks) setBlocked(grid, desk.seat[0], desk.seat[1], false);
  for (const seat of map.seats) setBlocked(grid, seat.tile[0], seat.tile[1], false);
  for (const poi of map.pois) for (const [x, y] of poi.tiles) setBlocked(grid, x, y, false);
  return grid;
}

export function encodeDerivedCollision(map: Mapa): string {
  return encodeCollision(deriveCollision(map));
}

/** Floor tile id for a room kind, with light variation so the floor does not look flat. */
function floorTile(kind: string, x: number, y: number): number {
  switch (kind) {
    case 'soc':
      return TILE.SOC;
    case 'terraco':
      return TILE.TERRACE;
    case 'servidores':
      return TILE.SERVER;
    case 'corredor':
    case 'passagem':
      return (x + y) % 2 === 0 ? TILE.CORRIDOR_A : TILE.CORRIDOR_B;
    default:
      return [TILE.FLOOR_A, TILE.FLOOR_B, TILE.FLOOR_C][(x * 7 + y * 3) % 3] as number;
  }
}

/** Tile layers drawn from the rooms and doors (placeholder tileset). */
export function deriveLayers(map: Mapa): DerivedLayers {
  const cells = map.cols * map.rows;
  const floor = new Array<number>(cells).fill(TILE.VOID);
  const walls = new Array<number>(cells).fill(TILE.VOID);
  const decorBelow = new Array<number>(cells).fill(0);
  const decorAbove = new Array<number>(cells).fill(0);
  const roomIndex = buildRoomIndex(map);
  const doorCells = new Set<number>();
  for (const door of map.doors) for (const [x, y] of door.tiles) doorCells.add(y * map.cols + x);

  for (let y = 0; y < map.rows; y++) {
    for (let x = 0; x < map.cols; x++) {
      const i = y * map.cols + x;
      const ri = (roomIndex[i] ?? 0) - 1;
      if (ri < 0) {
        if (doorCells.has(i)) floor[i] = TILE.DOORWAY;
        else walls[i] = TILE.WALL_TOP;
        continue;
      }
      const room = map.rooms[ri];
      if (!room) continue;
      floor[i] = floorTile(room.kind, x, y);
      if (doorCells.has(i)) {
        floor[i] = TILE.DOORWAY;
      } else if (isFaceRow(map, ri, y)) {
        const top = Math.min(...room.rects.filter((r) => y >= r[1]).map((r) => r[1]));
        walls[i] = y === top ? TILE.FACE_UPPER : TILE.FACE_LOWER;
      }
    }
  }
  // Glass panels sitting on wall cells (window rects that are not on a face row).
  for (const win of map.windows) {
    const [x1, y1, x2, y2] = win.rect;
    for (let y = y1; y <= y2; y++) {
      for (let x = x1; x <= x2; x++) {
        const i = y * map.cols + x;
        if (walls[i] === TILE.WALL_TOP) walls[i] = TILE.GLASS;
      }
    }
  }
  return { floor, walls, decorBelow, decorAbove };
}
