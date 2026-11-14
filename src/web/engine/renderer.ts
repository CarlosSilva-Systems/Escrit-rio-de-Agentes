// Canvas 2D renderer (ADR-0002). The whole world is drawn at 1x into an offscreen buffer and
// presented with ONE integer-scaled drawImage, so per-frame cost barely depends on zoom or screen
// size and pixels stay crisp at any devicePixelRatio.
//
//   static layer (cached)  ->  world buffer  ->  y-sorted furniture + sprites  ->  lighting  ->  present
//
// `Renderer` is backend-agnostic on purpose: a PixiJS backend could implement it if S-02 ever
// fails the budget.

import {
  computeView,
  type CameraState,
  type ViewRect,
  type ViewportPx,
} from '../../shared/world/camera';
import type { DayPhase, Rgba } from '../../shared/world/clock';
import type { LightLevel } from '../../shared/world/clock';
import { createSurface, type Surface } from './art/pixel';
import { TILE_SIZE } from './art/tiles';
import type { Atlas, Frame } from './atlas';
import { LightingLayer } from './lighting';
import { spriteSortY, type SpriteInstance } from './sprites';
import { buildWindowItems, type SceneItem, type World } from './world/world';

export interface RenderFrame {
  camera: CameraState;
  sprites: readonly SpriteInstance[];
  ambient: Rgba;
  zoneLevels: ReadonlyMap<string, LightLevel>;
  phase: DayPhase;
  rain: boolean;
  timeMs: number;
}

export interface Renderer {
  resize(widthPx: number, heightPx: number, dpr: number): void;
  render(frame: RenderFrame): ViewRect;
  /** Re-bake the cached static layer (season, project rooms, sky colour...). */
  invalidateStatic(): void;
  readonly viewport: ViewportPx;
}

type Rect = [number, number, number, number];
interface SpriteEntry {
  s: SpriteInstance;
  f: Frame;
  key: number;
  box: Rect;
}

function intersects(a: Rect, b: Rect): boolean {
  return a[0] < b[0] + b[2] && a[0] + a[2] > b[0] && a[1] < b[1] + b[3] && a[1] + a[3] > b[1];
}

function clipRect(r: Rect, w: number, h: number): Rect {
  const x1 = Math.max(0, r[0]);
  const y1 = Math.max(0, r[1]);
  const x2 = Math.min(w, r[0] + r[2]);
  const y2 = Math.min(h, r[1] + r[3]);
  return [x1, y1, Math.max(0, x2 - x1), Math.max(0, y2 - y1)];
}

/** Merges overlapping or touching rects until none do (few rects, so quadratic is fine). */
export function mergeRects(input: readonly Rect[]): Rect[] {
  const rects = input.filter((r) => r[2] > 0 && r[3] > 0).map((r): Rect => [...r]);
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i] as Rect;
        const b = rects[j] as Rect;
        if (
          a[0] <= b[0] + b[2] &&
          a[0] + a[2] >= b[0] &&
          a[1] <= b[1] + b[3] &&
          a[1] + a[3] >= b[1]
        ) {
          const x1 = Math.min(a[0], b[0]);
          const y1 = Math.min(a[1], b[1]);
          rects[i] = [
            x1,
            y1,
            Math.max(a[0] + a[2], b[0] + b[2]) - x1,
            Math.max(a[1] + a[3], b[1] + b[3]) - y1,
          ];
          rects.splice(j, 1);
          merged = true;
          break outer;
        }
      }
    }
  }
  return rects;
}

/** Above this many separate dirty regions a full redraw is cheaper (measured in S-02). */
const MAX_DIRTY_REGIONS = 3;

const PAGE_BACKGROUND = '#1F1A17'; // --bg-900, shown outside the map

function drawFrame(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  f: Frame,
  x: number,
  y: number,
  flip: boolean,
): void {
  if (!flip) {
    ctx.drawImage(f.source, f.sx, f.sy, f.sw, f.sh, x, y, f.sw, f.sh);
    return;
  }
  ctx.save();
  ctx.translate(x + f.sw, y);
  ctx.scale(-1, 1);
  ctx.drawImage(f.source, f.sx, f.sy, f.sw, f.sh, 0, 0, f.sw, f.sh);
  ctx.restore();
}

export class Canvas2DRenderer implements Renderer {
  readonly viewport: ViewportPx = { width: 1, height: 1, dpr: 1 };
  /** The 1x world buffer (exposed for the crispness test and the spike). */
  readonly buffer: Surface;
  private readonly staticLayer: Surface;
  /** Static layer + all furniture, no sprites, no light: the base dirty regions are restored from. */
  private readonly unlit: Surface;
  /** The unlit base as an image source (minimap). */
  get baseCanvas(): CanvasImageSource {
    return this.unlit.canvas as CanvasImageSource;
  }
  /** True when the last render() changed any pixel of the presented canvas. */
  changed = false;
  private fullDraw = true;
  private lastRain = false;
  private presentAll = true;
  private camKey = '';
  private lastView: ViewRect | null = null;
  private lastSig = new Map<string, string>();
  private lastBoxes = new Map<string, Rect>();
  private readonly lighting: LightingLayer;
  private readonly present: CanvasRenderingContext2D;
  private staticDirty = true;
  private staticPhase: DayPhase | null = null;
  private windowItems: SceneItem[] = [];
  /** Glass areas as x, y, w, h in world px, where rain streaks run down. */
  private windowRects: [number, number, number, number][] = [];

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly world: World,
    private readonly atlas: Atlas,
    private readonly useDirtyRegions = true,
  ) {
    this.buffer = createSurface(world.widthPx, world.heightPx, false);
    this.staticLayer = createSurface(world.widthPx, world.heightPx, false);
    this.unlit = createSurface(world.widthPx, world.heightPx, false);
    this.lighting = new LightingLayer(world);
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('2D canvas is not available');
    this.present = ctx;
  }

  resize(widthPx: number, heightPx: number, dpr: number): void {
    const w = Math.max(1, Math.floor(widthPx));
    const h = Math.max(1, Math.floor(heightPx));
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
    this.viewport.width = w;
    this.viewport.height = h;
    this.viewport.dpr = dpr;
    this.present.imageSmoothingEnabled = false; // resetting the canvas size resets this flag
    this.presentAll = true;
  }

  invalidateStatic(): void {
    this.staticDirty = true;
  }

  private bakeStatic(phase: DayPhase): void {
    const { ctx } = this.staticLayer;
    const { world, atlas } = this;
    const { cols, rows } = world.map;
    ctx.clearRect(0, 0, world.widthPx, world.heightPx);
    ctx.fillStyle = PAGE_BACKGROUND;
    ctx.fillRect(0, 0, world.widthPx, world.heightPx);
    const layers = [world.layers.floor, world.layers.walls, world.layers.decorBelow];
    for (const layer of layers) {
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const id = layer[y * cols + x];
          if (!id) continue;
          const f = atlas.tile(id);
          if (f)
            ctx.drawImage(
              f.source,
              f.sx,
              f.sy,
              f.sw,
              f.sh,
              x * TILE_SIZE,
              y * TILE_SIZE,
              TILE_SIZE,
              TILE_SIZE,
            );
        }
      }
    }
    this.windowItems = buildWindowItems(world.map, world.layers, atlas, phase, world.diagnostics);
    const byId = new Map(world.map.windows.map((w) => [w.id, w.rect]));
    this.windowRects = this.windowItems.flatMap((it) => {
      const rc = byId.get(it.id);
      return rc
        ? [
            [
              rc[0] * TILE_SIZE + 2,
              rc[1] * TILE_SIZE + 2,
              (rc[2] - rc[0] + 1) * TILE_SIZE - 4,
              (rc[3] - rc[1] + 1) * TILE_SIZE - 4,
            ] as [number, number, number, number],
          ]
        : [];
    });
    const items = [...world.statics, ...this.windowItems].sort(
      (a, b) => a.layer - b.layer || a.sortY - b.sortY,
    );
    for (const it of items) drawFrame(ctx, it.frame, it.x, it.y, false);
    for (const id of [world.layers.decorAbove]) {
      for (let i = 0; i < id.length; i++) {
        const tile = id[i];
        if (!tile) continue;
        const f = atlas.tile(tile);
        if (f)
          ctx.drawImage(
            f.source,
            f.sx,
            f.sy,
            f.sw,
            f.sh,
            (i % cols) * TILE_SIZE,
            Math.floor(i / cols) * TILE_SIZE,
            TILE_SIZE,
            TILE_SIZE,
          );
      }
    }
    // Unlit base = static layer + every piece of furniture (sprites are drawn per dirty region).
    const u = this.unlit.ctx;
    u.globalCompositeOperation = 'source-over';
    u.drawImage(this.staticLayer.canvas as CanvasImageSource, 0, 0);
    for (const it of world.sortables) drawFrame(u, it.frame, it.x, it.y, false);
    this.staticDirty = false;
    this.staticPhase = phase;
  }

  /**
   * Draws a frame. After the first full draw only the DIRTY regions (where a sprite appeared,
   * moved, animated or vanished, plus rain over windows) are restored from the unlit base,
   * re-drawn (furniture + sprites, y-sorted), re-lit and re-presented; a frame in which nothing
   * changed costs nothing (`changed` stays false and the canvas keeps its pixels).
   */
  render(frame: RenderFrame): ViewRect {
    this.changed = false;
    if (!this.useDirtyRegions) this.fullDraw = true;
    if (this.staticDirty || this.staticPhase !== frame.phase) {
      this.bakeStatic(frame.phase);
      this.fullDraw = true;
    }
    if (this.lighting.update(frame.ambient, frame.zoneLevels)) this.fullDraw = true;
    if (frame.rain !== this.lastRain) {
      this.lastRain = frame.rain;
      this.fullDraw = true; // drop the old streaks when rain stops
    }

    // Current sprite boxes and signatures.
    const entries: SpriteEntry[] = [];
    const sig = new Map<string, string>();
    for (const s of frame.sprites) {
      const f = this.atlas.frame(s.frameName);
      if (!f) continue;
      const x = Math.round(s.x) - f.ax;
      const y = Math.round(s.y) - f.ay;
      entries.push({ s, f, key: spriteSortY(s), box: [x - 1, y - 1, f.sw + 2, f.sh + 2] });
      sig.set(s.id, `${s.frameName}|${s.flip ? 1 : 0}|${x}|${y}`);
    }
    entries.sort((a, b) => a.key - b.key);

    const camKey = `${frame.camera.cx}|${frame.camera.cy}|${frame.camera.zoom}`;
    const camChanged = camKey !== this.camKey || this.presentAll;

    let dirty: Rect[] = [];
    if (!this.fullDraw) {
      for (const e of entries) {
        if (this.lastSig.get(e.s.id) !== sig.get(e.s.id)) {
          dirty.push(e.box);
          const old = this.lastBoxes.get(e.s.id);
          if (old) dirty.push(old);
        }
      }
      for (const [id, box] of this.lastBoxes) if (!sig.has(id)) dirty.push(box);
      if (frame.rain) dirty.push(...this.windowRects);
      dirty = mergeRects(dirty.map((r) => clipRect(r, this.world.widthPx, this.world.heightPx)));
      // Measured (S-02): many small regions cost MORE than one full redraw (clip + restore +
      // re-light per region, then one present per region). Dirty regions only pay off for a few.
      if (dirty.length > MAX_DIRTY_REGIONS) this.fullDraw = true;
    }

    if (this.fullDraw) {
      this.drawRegion(entries, [0, 0, this.world.widthPx, this.world.heightPx]);
      if (frame.rain) this.drawRain(frame.timeMs);
      this.changed = true;
    } else if (dirty.length > 0) {
      for (const r of dirty) this.drawRegion(entries, r);
      if (frame.rain) this.drawRain(frame.timeMs);
      this.changed = true;
    }

    this.lastSig = sig;
    this.lastBoxes = new Map(entries.map((e) => [e.s.id, e.box]));

    if (!this.changed && !camChanged && this.lastView) return this.lastView;

    const view = computeView(frame.camera, this.viewport, {
      width: this.world.widthPx,
      height: this.world.heightPx,
    });
    if (this.fullDraw || camChanged || !this.lastView) this.blit(view);
    else this.blitRects(view, dirty);
    this.fullDraw = false;
    this.presentAll = false;
    this.camKey = camKey;
    this.lastView = view;
    this.changed = true;
    return view;
  }

  /** Restores `region` from the unlit base, draws what intersects it (y-sorted) and lights it. */
  private drawRegion(entries: readonly SpriteEntry[], region: Rect): void {
    const ctx = this.buffer.ctx;
    const [rx, ry, rw, rh] = region;
    ctx.save();
    ctx.beginPath();
    ctx.rect(rx, ry, rw, rh);
    ctx.clip();
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.unlit.canvas as CanvasImageSource, rx, ry, rw, rh, rx, ry, rw, rh);

    const inRegion = entries.filter((e) => intersects(e.box, region));
    if (inRegion.length > 0) {
      // Furniture sorted at or before the lowest sprite is already (correctly) in the base; only
      // furniture that must be IN FRONT of some sprite is drawn again, merged in sort order.
      const minKey = (inRegion[0] as SpriteEntry).key;
      const furniture = this.world.sortables;
      let fi = 0;
      while (fi < furniture.length && (furniture[fi] as SceneItem).sortY <= minKey) fi++;
      const hits = (it: SceneItem) =>
        it.x < rx + rw && it.x + it.frame.sw > rx && it.y < ry + rh && it.y + it.frame.sh > ry;
      for (const e of inRegion) {
        while (fi < furniture.length && (furniture[fi] as SceneItem).sortY <= e.key) {
          const it = furniture[fi++] as SceneItem;
          if (hits(it)) drawFrame(ctx, it.frame, it.x, it.y, false);
        }
        drawFrame(ctx, e.f, Math.round(e.s.x) - e.f.ax, Math.round(e.s.y) - e.f.ay, e.s.flip);
      }
      while (fi < furniture.length) {
        const it = furniture[fi++] as SceneItem;
        if (hits(it)) drawFrame(ctx, it.frame, it.x, it.y, false);
      }
    }

    if (this.lighting.needsMultiply) {
      ctx.globalCompositeOperation = 'multiply';
      ctx.drawImage(
        this.lighting.multiply.canvas as CanvasImageSource,
        rx,
        ry,
        rw,
        rh,
        rx,
        ry,
        rw,
        rh,
      );
    }
    if (this.lighting.needsGlow) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(this.lighting.glow.canvas as CanvasImageSource, rx, ry, rw, rh, rx, ry, rw, rh);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  }

  /** Cheap rain: pixel streaks sliding down the window glass (only at high quality). */
  private drawRain(timeMs: number): void {
    const ctx = this.buffer.ctx;
    ctx.fillStyle = 'rgba(200, 225, 245, 0.75)';
    for (const [x, y, w, h] of this.windowRects) {
      const drops = Math.max(3, Math.floor((w * h) / 90));
      for (let i = 0; i < drops; i++) {
        const seed = (i * 2654435761) >>> 0;
        const speed = 0.04 + ((seed >> 8) % 5) * 0.01;
        const dx = (seed % Math.max(1, w - 2)) + 1;
        const dy = Math.floor((timeMs * speed + (seed >> 12)) % (h + 4)) - 2;
        if (dy >= 0 && dy < h - 2) {
          ctx.fillRect(x + dx, y + dy, 1, 2);
          ctx.fillRect(x + dx + 1, y + dy + 2, 1, 1);
        }
      }
    }
  }

  private blit(view: ViewRect): void {
    const p = this.present;
    p.fillStyle = PAGE_BACKGROUND;
    // Only the margins need clearing; the map covers the rest.
    if (
      view.dstX > 0 ||
      view.dstY > 0 ||
      view.dstX + view.dstW < this.viewport.width ||
      view.dstY + view.dstH < this.viewport.height
    ) {
      p.fillRect(0, 0, this.viewport.width, this.viewport.height);
    }
    if (view.srcW > 0 && view.srcH > 0) {
      p.drawImage(
        this.buffer.canvas as CanvasImageSource,
        view.srcX,
        view.srcY,
        view.srcW,
        view.srcH,
        view.dstX,
        view.dstY,
        view.dstW,
        view.dstH,
      );
    }
  }

  /** Presents only the changed rectangles (camera and size unchanged). */
  private blitRects(view: ViewRect, rects: readonly Rect[]): void {
    const p = this.present;
    for (const [rx, ry, rw, rh] of rects) {
      const x1 = Math.max(rx, view.srcX);
      const y1 = Math.max(ry, view.srcY);
      const x2 = Math.min(rx + rw, view.srcX + view.srcW);
      const y2 = Math.min(ry + rh, view.srcY + view.srcH);
      if (x2 <= x1 || y2 <= y1) continue;
      p.drawImage(
        this.buffer.canvas as CanvasImageSource,
        x1,
        y1,
        x2 - x1,
        y2 - y1,
        view.dstX + (x1 - view.srcX) * view.scale,
        view.dstY + (y1 - view.srcY) * view.scale,
        (x2 - x1) * view.scale,
        (y2 - y1) * view.scale,
      );
    }
  }
}
