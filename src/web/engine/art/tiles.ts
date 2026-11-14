// Built-in 16x16 tileset painted in code (floors, walls, wall faces, glass).

import { TILE } from '../../../shared/world/tileIds';
import { C } from './palette';
import { createSurface, hash2, px, rect, type PixelContext, type Surface } from './pixel';

export const TILE_SIZE = 16;
export const TILESET_COLUMNS = 16;

function plankFloor(ctx: PixelContext, ox: number, oy: number, variant: number): void {
  rect(ctx, C.floorHoney, ox, oy, 16, 16);
  // Four 4 px planks stacked; each plank has one end joint at a variant-dependent column.
  for (let band = 0; band < 4; band++) {
    const y = oy + band * 4;
    rect(ctx, C.floorHoneyDark, ox, y + 3, 16, 1);
    const jointX = ox + ((band * 5 + variant * 7) % 14) + 1;
    rect(ctx, C.floorHoneyDark, jointX, y, 1, 3);
    for (let i = 0; i < 2; i++) {
      const hx = Math.floor(hash2(variant, band, i + 1) * 14) + 1;
      px(ctx, C.floorHoneyLight, ox + hx, y + 1);
    }
  }
}

function corridorFloor(ctx: PixelContext, ox: number, oy: number, alt: boolean): void {
  rect(ctx, alt ? '#C9B492' : '#D2BE9D', ox, oy, 16, 16);
  rect(ctx, '#B39C78', ox, oy, 16, 1);
  rect(ctx, '#B39C78', ox, oy, 1, 16);
  px(ctx, '#E0CDAC', ox + 5, oy + 5);
  px(ctx, '#E0CDAC', ox + 11, oy + 10);
}

function socFloor(ctx: PixelContext, ox: number, oy: number): void {
  rect(ctx, C.socFloor, ox, oy, 16, 16);
  rect(ctx, '#2F3F50', ox, oy + 7, 16, 1);
  rect(ctx, '#2F3F50', ox + 7, oy, 1, 16);
  px(ctx, C.socBlue, ox + 3, oy + 3);
  px(ctx, C.socBlue, ox + 11, oy + 11);
}

function terraceFloor(ctx: PixelContext, ox: number, oy: number): void {
  rect(ctx, '#E3C896', ox, oy, 16, 16);
  for (let i = 0; i < 4; i++) rect(ctx, '#CFAE78', ox, oy + i * 4 + 3, 16, 1);
  rect(ctx, '#CFAE78', ox + 8, oy, 1, 3);
  rect(ctx, '#CFAE78', ox + 3, oy + 8, 1, 3);
  px(ctx, '#F1DDB2', ox + 12, oy + 1);
}

function serverFloor(ctx: PixelContext, ox: number, oy: number): void {
  rect(ctx, '#3A4756', ox, oy, 16, 16);
  rect(ctx, '#2F3A47', ox, oy, 16, 1);
  rect(ctx, '#2F3A47', ox, oy, 1, 16);
  for (let y = 3; y < 16; y += 4)
    for (let x = 3; x < 16; x += 4) px(ctx, '#2A3340', ox + x, oy + y);
}

function doorway(ctx: PixelContext, ox: number, oy: number): void {
  rect(ctx, C.wallTrim, ox, oy, 16, 16);
  rect(ctx, '#C99B66', ox, oy + 3, 16, 1);
  rect(ctx, '#C99B66', ox, oy + 9, 16, 1);
  rect(ctx, C.wallTrimDark, ox, oy, 16, 1);
}

function wallTop(ctx: PixelContext, ox: number, oy: number): void {
  rect(ctx, '#8C6A47', ox, oy, 16, 16);
  rect(ctx, C.wallTrim, ox, oy, 16, 2);
  rect(ctx, '#6F5236', ox, oy + 14, 16, 2);
  px(ctx, '#A07B52', ox + 4, oy + 7);
  px(ctx, '#A07B52', ox + 11, oy + 9);
}

function faceUpper(ctx: PixelContext, ox: number, oy: number): void {
  rect(ctx, C.wallCream, ox, oy, 16, 16);
  rect(ctx, C.wallTrimDark, ox, oy, 16, 1); // top edge against the wall cap
  px(ctx, C.wallCreamShade, ox + 3, oy + 6);
  px(ctx, C.wallCreamShade, ox + 10, oy + 11);
}

function faceLower(ctx: PixelContext, ox: number, oy: number): void {
  rect(ctx, C.wallCream, ox, oy, 16, 16);
  rect(ctx, C.wallCreamShade, ox, oy + 10, 16, 2);
  rect(ctx, C.wallTrim, ox, oy + 12, 16, 4); // baseboard
  rect(ctx, C.wallTrimDark, ox, oy + 12, 16, 1);
  rect(ctx, '#6F5236', ox, oy + 15, 16, 1);
}

function glass(ctx: PixelContext, ox: number, oy: number): void {
  rect(ctx, C.wallTrim, ox, oy, 16, 16);
  rect(ctx, '#BFE3F5', ox + 3, oy, 10, 16);
  rect(ctx, '#E6F5FB', ox + 4, oy + 2, 1, 6);
  rect(ctx, C.wallTrimDark, ox + 2, oy, 1, 16);
  rect(ctx, C.wallTrimDark, ox + 13, oy, 1, 16);
}

type Painter = (ctx: PixelContext, ox: number, oy: number) => void;

const PAINTERS: Record<number, Painter> = {
  [TILE.FLOOR_A]: (c, x, y) => plankFloor(c, x, y, 0),
  [TILE.FLOOR_B]: (c, x, y) => plankFloor(c, x, y, 1),
  [TILE.FLOOR_C]: (c, x, y) => plankFloor(c, x, y, 2),
  [TILE.CORRIDOR_A]: (c, x, y) => corridorFloor(c, x, y, false),
  [TILE.CORRIDOR_B]: (c, x, y) => corridorFloor(c, x, y, true),
  [TILE.SOC]: socFloor,
  [TILE.TERRACE]: terraceFloor,
  [TILE.SERVER]: serverFloor,
  [TILE.DOORWAY]: doorway,
  [TILE.WALL_TOP]: wallTop,
  [TILE.FACE_UPPER]: faceUpper,
  [TILE.FACE_LOWER]: faceLower,
  [TILE.GLASS]: glass,
};

/** Paints the built-in tileset into a 16-column sheet (tile id n sits at column n % 16, row n / 16). */
export function paintTileset(): Surface {
  const rows = 2;
  const surface = createSurface(TILESET_COLUMNS * TILE_SIZE, rows * TILE_SIZE);
  for (const [idText, paint] of Object.entries(PAINTERS)) {
    const id = Number(idText);
    paint(
      surface.ctx,
      (id % TILESET_COLUMNS) * TILE_SIZE,
      Math.floor(id / TILESET_COLUMNS) * TILE_SIZE,
    );
  }
  return surface;
}
