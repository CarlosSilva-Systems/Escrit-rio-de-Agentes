// Camera math (ARQUITETURA §7.3, ADR-0002). Pure: no DOM, no canvas.
//
// Invariant that keeps pixel art crisp at any devicePixelRatio: the world is drawn into a 1x
// buffer and presented with an INTEGER number of device pixels per art pixel (`scale`), at an
// INTEGER device-pixel origin. There is never a fractional source or destination offset.

export const ZOOM_LEVELS = [2, 3, 4] as const;
export type ZoomLevel = (typeof ZOOM_LEVELS)[number];
export const DEFAULT_ZOOM: ZoomLevel = 2;

/** Camera centre in art pixels (1x world coordinates) and the user-facing zoom level. */
export interface CameraState {
  cx: number;
  cy: number;
  zoom: ZoomLevel;
}

/** Size of the presentation canvas in DEVICE pixels, plus the device pixel ratio. */
export interface ViewportPx {
  width: number;
  height: number;
  dpr: number;
}

export interface WorldSize {
  width: number;
  height: number;
}

/** Area of the viewport covered by drawers/panels (device pixels); used to centre on the free area. */
export interface Insets {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface ViewRect {
  /** Device pixels per art pixel (integer >= 1). */
  scale: number;
  /** Device-pixel position of art pixel (0,0). Integer; may be negative or positive. */
  originX: number;
  originY: number;
  /** Source rect in the 1x world buffer (integers). */
  srcX: number;
  srcY: number;
  srcW: number;
  srcH: number;
  /** Destination rect on the presentation canvas (integers, srcW*scale by srcH*scale). */
  dstX: number;
  dstY: number;
  dstW: number;
  dstH: number;
}

/**
 * Integer device pixels per art pixel. `zoom` is the CSS-pixel zoom the user picked (2, 3, 4);
 * at DPR 1.25 zoom 3 becomes 4 device px per art px (3.2x in CSS px, still crisp), at DPR 1.5
 * zoom 2 becomes 3 (exactly 2x in CSS px).
 */
export function integerScale(zoom: number, dpr: number): number {
  const safeDpr = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  return Math.max(1, Math.round(zoom * safeDpr));
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Keeps the visible area inside the world, or centred when the world is smaller than the view. */
export function clampCamera(cam: CameraState, vp: ViewportPx, world: WorldSize): CameraState {
  const s = integerScale(cam.zoom, vp.dpr);
  const halfW = vp.width / s / 2;
  const halfH = vp.height / s / 2;
  const cx = world.width <= halfW * 2 ? world.width / 2 : clamp(cam.cx, halfW, world.width - halfW);
  const cy =
    world.height <= halfH * 2 ? world.height / 2 : clamp(cam.cy, halfH, world.height - halfH);
  return { cx, cy, zoom: cam.zoom };
}

/** Resolves the camera into integer blit rectangles. */
export function computeView(cam: CameraState, vp: ViewportPx, world: WorldSize): ViewRect {
  const scale = integerScale(cam.zoom, vp.dpr);
  const c = clampCamera(cam, vp, world);
  const viewW = vp.width / scale;
  const viewH = vp.height / scale;

  const axis = (center: number, view: number, worldLen: number, vpLen: number) => {
    if (worldLen * scale <= vpLen) return Math.floor((vpLen - worldLen * scale) / 2);
    const left = Math.round(center - view / 2); // snap the top-left to a whole art pixel
    return -left * scale;
  };
  const originX = axis(c.cx, viewW, world.width, vp.width);
  const originY = axis(c.cy, viewH, world.height, vp.height);

  const srcX = Math.max(0, Math.floor(-originX / scale));
  const srcY = Math.max(0, Math.floor(-originY / scale));
  const dstX = originX + srcX * scale;
  const dstY = originY + srcY * scale;
  const srcW = Math.min(world.width - srcX, Math.ceil((vp.width - dstX) / scale));
  const srcH = Math.min(world.height - srcY, Math.ceil((vp.height - dstY) / scale));
  return {
    scale,
    originX,
    originY,
    srcX,
    srcY,
    srcW: Math.max(0, srcW),
    srcH: Math.max(0, srcH),
    dstX,
    dstY,
    dstW: Math.max(0, srcW) * scale,
    dstH: Math.max(0, srcH) * scale,
  };
}

export function screenToWorld(
  view: ViewRect,
  devX: number,
  devY: number,
): { x: number; y: number } {
  return { x: (devX - view.originX) / view.scale, y: (devY - view.originY) / view.scale };
}

export function worldToScreen(view: ViewRect, wx: number, wy: number): { x: number; y: number } {
  return { x: view.originX + wx * view.scale, y: view.originY + wy * view.scale };
}

/** Drag-pan by a device-pixel delta (content follows the pointer). */
export function panBy(
  cam: CameraState,
  dxDev: number,
  dyDev: number,
  vp: ViewportPx,
  world: WorldSize,
): CameraState {
  const s = integerScale(cam.zoom, vp.dpr);
  return clampCamera({ ...cam, cx: cam.cx - dxDev / s, cy: cam.cy - dyDev / s }, vp, world);
}

/** Next zoom level in `direction` (+1 closer, -1 farther), clamped to 2x..4x. */
export function stepZoom(zoom: ZoomLevel, direction: 1 | -1): ZoomLevel {
  const i = ZOOM_LEVELS.indexOf(zoom);
  return ZOOM_LEVELS[clamp(i + direction, 0, ZOOM_LEVELS.length - 1)] as ZoomLevel;
}

/** Changes zoom keeping the world point under `anchor` (device px) fixed. */
export function zoomAt(
  cam: CameraState,
  direction: 1 | -1,
  anchor: { x: number; y: number },
  vp: ViewportPx,
  world: WorldSize,
): CameraState {
  const zoom = stepZoom(cam.zoom, direction);
  if (zoom === cam.zoom) return cam;
  const before = computeView(cam, vp, world);
  const w = screenToWorld(before, anchor.x, anchor.y);
  const s2 = integerScale(zoom, vp.dpr);
  const cx = w.x - anchor.x / s2 + vp.width / s2 / 2;
  const cy = w.y - anchor.y / s2 + vp.height / s2 / 2;
  return clampCamera({ cx, cy, zoom }, vp, world);
}

export function setZoom(
  cam: CameraState,
  zoom: ZoomLevel,
  vp: ViewportPx,
  world: WorldSize,
): CameraState {
  return clampCamera({ ...cam, zoom }, vp, world);
}

/** Centres on a world point, optionally inside the area not covered by drawers/panels. */
export function centerOn(
  cam: CameraState,
  wx: number,
  wy: number,
  vp: ViewportPx,
  world: WorldSize,
  insets: Insets = { left: 0, right: 0, top: 0, bottom: 0 },
): CameraState {
  const s = integerScale(cam.zoom, vp.dpr);
  // The free area's centre is shifted from the viewport centre by half the inset difference.
  const shiftX = (insets.left - insets.right) / 2 / s;
  const shiftY = (insets.top - insets.bottom) / 2 / s;
  return clampCamera({ ...cam, cx: wx - shiftX, cy: wy - shiftY }, vp, world);
}

/**
 * One follow step: exponential approach with the "0.1 per 60 Hz frame" feel, independent of
 * the actual frame rate. `reducedMotion` jumps straight to the target.
 */
export function followStep(
  cam: CameraState,
  target: { x: number; y: number },
  dtMs: number,
  vp: ViewportPx,
  world: WorldSize,
  reducedMotion = false,
): CameraState {
  const k = reducedMotion ? 1 : 1 - Math.pow(0.9, clamp(dtMs, 0, 100) / (1000 / 60));
  return clampCamera(
    { ...cam, cx: cam.cx + (target.x - cam.cx) * k, cy: cam.cy + (target.y - cam.cy) * k },
    vp,
    world,
  );
}
