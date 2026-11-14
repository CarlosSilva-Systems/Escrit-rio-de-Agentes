// World model: a validated mapa/v1 document turned into what the renderer and the simulation need
// (walkability grid, static/sorted scene items, room and light-zone lookups).

import type { Mapa } from '../../../shared/contracts/mapa';
import { decodeCollision, type Grid } from '../../../shared/world/grid';
import {
  buildRoomIndex,
  deriveLayers,
  isStaticSprite,
  type DerivedLayers,
} from '../../../shared/world/layers';
import { TILE_SIZE } from '../art/tiles';
import type { Atlas, Frame } from '../atlas';
import { canonicalSprite } from '../../../shared/world/spriteAliases';
import type { DayPhase } from '../../../shared/world/clock';
import { TILE } from '../../../shared/world/tileIds';

export interface SceneItem {
  id: string;
  frame: Frame;
  /** World pixel position of the sprite's top-left corner. */
  x: number;
  y: number;
  /** Draw order key (bottom of the footprint, plus a small chair offset). */
  sortY: number;
  /** Static items only: 0 = rugs (under everything), 1 = the rest. */
  layer: number;
}

type Rect = [number, number, number, number];

export interface World {
  map: Mapa;
  grid: Grid;
  widthPx: number;
  heightPx: number;
  /** Layers actually drawn (derived from rooms when the map's tileset art is unavailable). */
  layers: DerivedLayers;
  /** True when the map's own tileset could not be used and the placeholder look is drawn. */
  placeholderTiles: boolean;
  /** Flat items painted into the cached static layer (rugs, wall decoration, hammock...). */
  statics: SceneItem[];
  /** Furniture drawn every frame, y-sorted together with the NPCs. Sorted by `sortY`. */
  sortables: SceneItem[];
  roomsById: Map<string, Mapa['rooms'][number]>;
  /** Room index per cell (0 = none, otherwise index into `map.rooms` + 1). */
  roomIndex: Uint16Array;
  /** Pixel rects `[x, y, w, h]` covered by each light zone. */
  zoneRects: Map<string, Rect[]>;
  /** Problems found while building (unknown sprites...). Never thrown: art is optional. */
  diagnostics: string[];
}

function chairSortOffset(rawSprite: string): number {
  const sprite = canonicalSprite(rawSprite);
  if (sprite === 'furn/chair-n') return 2; // chair back is in front of a seated NPC
  if (sprite.startsWith('furn/chair')) return -2; // chair back is behind the NPC
  return 0;
}

/** Window sprites painted on wall faces; glass panels on wall cells come from the tile layer. */
export function buildWindowItems(
  map: Mapa,
  layers: DerivedLayers,
  atlas: Atlas,
  phase: DayPhase,
  diagnostics: string[] = [],
): SceneItem[] {
  const items: SceneItem[] = [];
  for (const win of map.windows) {
    const [x1, y1, x2, y2] = win.rect;
    let onWallFace = false;
    for (let y = y1; y <= y2 && !onWallFace; y++)
      for (let x = x1; x <= x2; x++) {
        const cell = layers.walls[y * map.cols + x];
        if (cell !== undefined && cell !== 0 && cell !== TILE.GLASS) onWallFace = true;
      }
    if (!onWallFace) continue;
    const w = x2 - x1 + 1;
    const h = y2 - y1 + 1;
    const frame = atlas.frame(`window/${win.view}:${phase}@${w}x${h}`);
    if (!frame) {
      diagnostics.push(`window ${win.id}: no sprite`);
      continue;
    }
    items.push({
      id: win.id,
      frame,
      x: x1 * TILE_SIZE - frame.ax,
      y: y1 * TILE_SIZE - frame.ay,
      sortY: y2 * TILE_SIZE,
      layer: 1,
    });
  }
  return items;
}

export function createWorld(map: Mapa, atlas: Atlas, tilesetUsable: boolean): World {
  const diagnostics: string[] = [];
  const layers = tilesetUsable ? map.layers : deriveLayers(map);
  const statics: SceneItem[] = [];
  const sortables: SceneItem[] = [];

  for (const obj of map.objects) {
    const [tx, ty] = obj.tile;
    const [fw, fh] = obj.footprint;
    const size = `@${fw}x${fh}`;
    const frame = atlas.frame(obj.sprite + size) ?? atlas.frame(canonicalSprite(obj.sprite) + size);
    if (!frame) {
      diagnostics.push(`object ${obj.id}: unknown sprite "${obj.sprite}"`);
      continue;
    }
    const item: SceneItem = {
      id: obj.id,
      frame,
      x: tx * TILE_SIZE - frame.ax,
      y: ty * TILE_SIZE - frame.ay,
      sortY: (ty + fh) * TILE_SIZE + chairSortOffset(obj.sprite),
      layer: canonicalSprite(obj.sprite).startsWith('rug/') ? 0 : 1,
    };
    (isStaticSprite(obj.sprite) ? statics : sortables).push(item);
  }
  // Stable sort keeps declaration order for equal keys (a coffee machine stays above its counter).
  sortables.sort((a, b) => a.sortY - b.sortY);
  statics.sort((a, b) => a.layer - b.layer || a.sortY - b.sortY);

  const roomsById = new Map(map.rooms.map((r) => [r.id, r]));
  const zoneRects = new Map<string, Rect[]>();
  for (const zone of map.lightZones) {
    const rects: Rect[] = [];
    for (const roomId of zone.rooms) {
      for (const [x1, y1, x2, y2] of roomsById.get(roomId)?.rects ?? []) {
        rects.push([
          x1 * TILE_SIZE,
          y1 * TILE_SIZE,
          (x2 - x1 + 1) * TILE_SIZE,
          (y2 - y1 + 1) * TILE_SIZE,
        ]);
      }
    }
    zoneRects.set(zone.id, rects);
  }

  return {
    map,
    grid: decodeCollision(map.collision, map.cols, map.rows),
    widthPx: map.cols * TILE_SIZE,
    heightPx: map.rows * TILE_SIZE,
    layers,
    placeholderTiles: !tilesetUsable,
    statics,
    sortables,
    roomsById,
    roomIndex: buildRoomIndex(map),
    zoneRects,
    diagnostics,
  };
}

export function roomAt(world: World, tx: number, ty: number): Mapa['rooms'][number] | undefined {
  if (tx < 0 || ty < 0 || tx >= world.map.cols || ty >= world.map.rows) return undefined;
  const i = (world.roomIndex[ty * world.map.cols + tx] ?? 0) - 1;
  return i >= 0 ? world.map.rooms[i] : undefined;
}

/** Centre of a room's camera point (tile coords -> world pixels), when the map defines one. */
export function roomCameraPoint(world: World, roomId: string): { x: number; y: number } | null {
  const room = world.roomsById.get(roomId);
  if (!room?.camera) return null;
  return { x: (room.camera[0] + 0.5) * TILE_SIZE, y: (room.camera[1] + 0.5) * TILE_SIZE };
}
