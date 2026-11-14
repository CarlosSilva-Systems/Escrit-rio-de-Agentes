// Small helpers for drawing pixel art in code (provisional art, no third-party PNGs).

export type PixelCanvas = HTMLCanvasElement | OffscreenCanvas;
export type PixelContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface Surface {
  canvas: PixelCanvas;
  ctx: PixelContext;
}

/**
 * Offscreen when available (workers, no DOM layout cost); a detached <canvas> otherwise.
 * `readback` (default true) is for art that is post-processed with getImageData (outlines): it keeps the
 * canvas CPU-backed. Per-frame buffers pass false so the browser may GPU-accelerate them.
 */
export function createSurface(width: number, height: number, readback = true): Surface {
  const w = Math.max(1, Math.ceil(width));
  const h = Math.max(1, Math.ceil(height));
  let canvas: PixelCanvas;
  if (typeof OffscreenCanvas !== 'undefined') {
    canvas = new OffscreenCanvas(w, h);
  } else {
    const el = document.createElement('canvas');
    el.width = w;
    el.height = h;
    canvas = el;
  }
  const ctx = canvas.getContext('2d', { willReadFrequently: readback }) as PixelContext | null;
  if (!ctx) throw new Error('2D canvas is not available');
  ctx.imageSmoothingEnabled = false;
  return { canvas, ctx };
}

export function rect(
  ctx: PixelContext,
  color: string,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

export function px(ctx: PixelContext, color: string, x: number, y: number): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, 1, 1);
}

/** Paints an ASCII bitmap: each char is looked up in `legend`; '.' and unknown chars are transparent. */
export function paintAscii(
  ctx: PixelContext,
  rows: readonly string[],
  legend: Readonly<Record<string, string>>,
  x: number,
  y: number,
): void {
  rows.forEach((row, ry) => {
    for (let rx = 0; rx < row.length; rx++) {
      const color = legend[row[rx] as string];
      if (color) px(ctx, color, x + rx, y + ry);
    }
  });
}

/** Adds a 1 px outline around the opaque silhouette (4-neighbourhood), in place. */
export function addOutline(
  surface: Surface,
  color: string,
  region?: [number, number, number, number],
): void {
  const { ctx, canvas } = surface;
  const [rx, ry, rw, rh] = region ?? [0, 0, canvas.width, canvas.height];
  const img = ctx.getImageData(rx, ry, rw, rh);
  const src = img.data;
  const out = new Uint8ClampedArray(src);
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  const alpha = (x: number, y: number) =>
    x < 0 || y < 0 || x >= rw || y >= rh ? 0 : (src[(y * rw + x) * 4 + 3] as number);
  for (let y = 0; y < rh; y++) {
    for (let x = 0; x < rw; x++) {
      if (alpha(x, y) > 0) continue;
      if (
        alpha(x - 1, y) > 0 ||
        alpha(x + 1, y) > 0 ||
        alpha(x, y - 1) > 0 ||
        alpha(x, y + 1) > 0
      ) {
        const i = (y * rw + x) * 4;
        out[i] = r;
        out[i + 1] = g;
        out[i + 2] = b;
        out[i + 3] = 255;
      }
    }
  }
  ctx.putImageData(new ImageData(out, rw, rh), rx, ry);
}

/** Deterministic hash for placing "random-looking" details without Math.random. */
export function hash2(x: number, y: number, seed = 0): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
