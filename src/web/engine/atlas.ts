// Sprite atlas abstraction. The engine only talks to `Atlas`; where pixels come from (code today,
// real PNG sheets described by a manifest later) is swappable without touching the engine.
//
// Conventions (same as the production art will follow):
//  - Every frame carries an anchor `(ax, ay)` = position of the TILE/FOOTPRINT top-left corner
//    inside the sprite, so a sprite is drawn at `(tileX*16 - ax, tileY*16 - ay)`.
//  - Character frames are named `npc-<name>/<anim>/<dir>/<frame>` with dir s|n|e (W = E mirrored),
//    portraits `npc-<name>/portrait`; icons `icon/<name>`; furniture `furn/…`, `flat/…`,
//    `face/…`, `rug/…`, `window/<view>:<phase>` optionally suffixed `@<w>x<h>` (tiles).

import {
  ALL_SPECS,
  CELL_H,
  CELL_W,
  paintCharacterSheet,
  paintPortrait,
  SHEET_LAYOUT,
  type Anim,
  type Dir,
} from './art/characters';
import { paintFurniture } from './art/furniture';
import { ICON_NAMES, ICON_SIZE, paintIcon } from './art/icons';
import type { Surface } from './art/pixel';
import { paintTileset, TILE_SIZE, TILESET_COLUMNS } from './art/tiles';

/**
 * The code-drawn art is painted on CPU-backed canvases (it needs getImageData for outlines). Drawing
 * a CPU canvas into the GPU-backed world buffer re-uploads it, so each canvas is converted ONCE to an
 * ImageBitmap (texture-friendly) in the background and frames switch to it when ready.
 */
const bitmaps = new Map<object, ImageBitmap>();
const converting = new Set<object>();
function gpuSource(canvas: CanvasImageSource & object): CanvasImageSource {
  const ready = bitmaps.get(canvas);
  if (ready) return ready;
  if (!converting.has(canvas) && typeof createImageBitmap === 'function') {
    converting.add(canvas);
    createImageBitmap(canvas as ImageBitmapSource)
      .then((bmp) => void bitmaps.set(canvas, bmp))
      .catch(() => undefined);
  }
  return canvas;
}

export interface Frame {
  source: CanvasImageSource;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  /** Position of the tile/footprint top-left corner inside the sprite. */
  ax: number;
  ay: number;
}

export interface Atlas {
  /** Sprite or character frame by name; undefined when this atlas does not know it. */
  frame(name: string): Frame | undefined;
  /** Tile image for a tile id of the active tileset; undefined = draw nothing. */
  tile(id: number): Frame | undefined;
  /** True when this atlas provides real tile art for the ids of `mapa.json` (vs. the built-in set). */
  readonly providesTiles: boolean;
}

/** First atlas that knows a name wins (override layers first, procedural last). */
export function composeAtlases(layers: readonly Atlas[]): Atlas {
  return {
    providesTiles: layers.some((l) => l.providesTiles),
    frame(name) {
      for (const layer of layers) {
        const f = layer.frame(name);
        if (f) return f;
      }
      // A sized request (`name@WxH`) may be satisfied by a fixed-size sprite named without it.
      const at = name.indexOf('@');
      if (at > 0) {
        const bare = name.slice(0, at);
        for (const layer of layers) {
          const f = layer.frame(bare);
          if (f) return f;
        }
      }
      return undefined;
    },
    tile(id) {
      for (const layer of layers) {
        const f = layer.tile(id);
        if (f) return f;
      }
      return undefined;
    },
  };
}

/** Everything is drawn in code (tiles, furniture, 16+3 characters, icons). Frames are cached. */
export function createProceduralAtlas(): Atlas {
  const tileset = paintTileset();
  const sheets = new Map<string, Surface>();
  const portraits = new Map<string, Surface>();
  const specs = new Map(ALL_SPECS.map((s) => [s.key, s]));
  const icons = new Map<string, Surface>();
  const frames = new Map<string, Frame | null>();

  const sheetFor = (key: string): Surface | undefined => {
    const cached = sheets.get(key);
    if (cached) return cached;
    const spec = specs.get(key);
    if (!spec) return undefined;
    const sheet = paintCharacterSheet(spec);
    sheets.set(key, sheet);
    return sheet;
  };

  const characterFrame = (
    key: string,
    anim: string,
    dir: string,
    index: number,
  ): Frame | undefined => {
    const slot = SHEET_LAYOUT.find((s) => s.anim === (anim as Anim) && s.dir === (dir as Dir));
    if (!slot || index < 0 || index >= slot.frames) return undefined;
    const sheet = sheetFor(key);
    if (!sheet) return undefined;
    return {
      get source() {
        return gpuSource(sheet.canvas);
      },
      sx: (slot.col + index) * CELL_W,
      sy: slot.row * CELL_H,
      sw: CELL_W,
      sh: CELL_H,
      ax: 0,
      ay: CELL_H - TILE_SIZE,
    };
  };

  const resolve = (name: string): Frame | undefined => {
    if (name.startsWith('npc-')) {
      const parts = name.split('/');
      const key = parts[0] as string;
      if (parts[1] === 'portrait') {
        const spec = specs.get(key);
        const sheet = sheetFor(key);
        if (!spec || !sheet) return undefined;
        let portrait = portraits.get(key);
        if (!portrait) {
          portrait = paintPortrait(sheet, spec);
          portraits.set(key, portrait);
        }
        const canvas = portrait.canvas;
        return {
          get source() {
            return gpuSource(canvas);
          },
          sx: 0,
          sy: 0,
          sw: 16,
          sh: 16,
          ax: 0,
          ay: 0,
        };
      }
      return characterFrame(key, parts[1] ?? '', parts[2] ?? '', Number(parts[3] ?? 0));
    }
    if (name.startsWith('icon/')) {
      const iconName = name.slice(5) as (typeof ICON_NAMES)[number];
      if (!ICON_NAMES.includes(iconName)) return undefined;
      let surface = icons.get(iconName);
      if (!surface) {
        surface = paintIcon(iconName);
        icons.set(iconName, surface);
      }
      const canvas = surface.canvas;
      return {
        get source() {
          return gpuSource(canvas);
        },
        sx: 0,
        sy: 0,
        sw: ICON_SIZE,
        sh: ICON_SIZE,
        ax: 0,
        ay: 0,
      };
    }
    const art = paintFurniture(name);
    if (!art) return undefined;
    return {
      get source() {
        return gpuSource(art.surface.canvas);
      },
      sx: 0,
      sy: 0,
      sw: art.surface.canvas.width,
      sh: art.surface.canvas.height,
      ax: art.ax,
      ay: art.ay,
    };
  };

  return {
    providesTiles: false,
    frame(name) {
      const cached = frames.get(name);
      if (cached !== undefined) return cached ?? undefined;
      const frame = resolve(name) ?? null;
      frames.set(name, frame);
      return frame ?? undefined;
    },
    tile(id) {
      if (id <= 0) return undefined;
      const sx = (id % TILESET_COLUMNS) * TILE_SIZE;
      const sy = Math.floor(id / TILESET_COLUMNS) * TILE_SIZE;
      return {
        get source() {
          return gpuSource(tileset.canvas);
        },
        sx,
        sy,
        sw: TILE_SIZE,
        sh: TILE_SIZE,
        ax: 0,
        ay: 0,
      };
    },
  };
}

/** Character animation frame; `w` resolves to the mirrored `e` frame (flip handled by the caller). */
export function characterFrameName(
  spriteKey: string,
  anim: Anim,
  dir: Dir | 'w',
  frame: number,
): {
  name: string;
  flip: boolean;
} {
  const base = dir === 'w' ? 'e' : dir;
  return { name: `${spriteKey}/${anim}/${base}/${frame}`, flip: dir === 'w' };
}
