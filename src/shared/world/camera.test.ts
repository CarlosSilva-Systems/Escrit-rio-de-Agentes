import { describe, expect, it } from 'vitest';
import {
  centerOn,
  clampCamera,
  computeView,
  followStep,
  integerScale,
  panBy,
  screenToWorld,
  stepZoom,
  worldToScreen,
  zoomAt,
  type CameraState,
  type ViewportPx,
  type WorldSize,
} from './camera';

const WORLD: WorldSize = { width: 1024, height: 832 };
const vp = (cssW: number, cssH: number, dpr: number): ViewportPx => ({
  width: Math.round(cssW * dpr),
  height: Math.round(cssH * dpr),
  dpr,
});

describe('integerScale', () => {
  it('CA-80: zoom 2/3/4 map to integer device pixels at DPR 1, 1.25 and 1.5', () => {
    expect([2, 3, 4].map((z) => integerScale(z, 1))).toEqual([2, 3, 4]);
    expect([2, 3, 4].map((z) => integerScale(z, 1.25))).toEqual([3, 4, 5]);
    expect([2, 3, 4].map((z) => integerScale(z, 1.5))).toEqual([3, 5, 6]);
  });

  it('CA-80: never returns less than 1 and survives a bad DPR', () => {
    expect(integerScale(2, 0)).toBe(2);
    expect(integerScale(2, Number.NaN)).toBe(2);
    expect(integerScale(0.1, 1)).toBe(1);
  });
});

describe('computeView', () => {
  it.each([1, 1.25, 1.5])('CA-80: blit rects are whole pixels at DPR %s', (dpr) => {
    const v = vp(1920, 1080, dpr);
    for (const zoom of [2, 3, 4] as const) {
      const cam: CameraState = { cx: 517.3, cy: 401.7, zoom };
      const view = computeView(cam, v, WORLD);
      for (const n of [
        view.scale,
        view.originX,
        view.originY,
        view.srcX,
        view.srcY,
        view.srcW,
        view.srcH,
        view.dstX,
        view.dstY,
        view.dstW,
        view.dstH,
      ]) {
        expect(Number.isInteger(n)).toBe(true);
      }
      expect(view.dstW).toBe(view.srcW * view.scale);
      expect(view.dstH).toBe(view.srcH * view.scale);
      // The blit covers the whole canvas (the map is larger than the view at these zooms).
      expect(view.dstX).toBeLessThanOrEqual(0);
      expect(view.dstX + view.dstW).toBeGreaterThanOrEqual(v.width);
    }
  });

  it('CA-80: centres a world smaller than the viewport', () => {
    const v = vp(3000, 2400, 1);
    const view = computeView({ cx: 0, cy: 0, zoom: 2 }, v, WORLD);
    expect(view.srcX).toBe(0);
    expect(view.srcW).toBe(WORLD.width);
    expect(view.originX).toBe(Math.floor((3000 - 2048) / 2));
  });

  it('CA-80: never shows area outside the world', () => {
    const v = vp(800, 600, 1);
    const view = computeView({ cx: -500, cy: 99999, zoom: 3 }, v, WORLD);
    expect(view.srcX).toBe(0);
    expect(view.srcX + view.srcW).toBeLessThanOrEqual(WORLD.width);
    expect(view.srcY + view.srcH).toBeLessThanOrEqual(WORLD.height);
  });
});

describe('screen/world mapping', () => {
  it('CA-80: screenToWorld inverts worldToScreen', () => {
    const v = vp(1280, 720, 1.25);
    const view = computeView({ cx: 400, cy: 300, zoom: 3 }, v, WORLD);
    const s = worldToScreen(view, 123, 456);
    const w = screenToWorld(view, s.x, s.y);
    expect(w.x).toBeCloseTo(123, 6);
    expect(w.y).toBeCloseTo(456, 6);
  });
});

describe('zoom and pan', () => {
  it('CA-80: zoom steps stay within 2x..4x', () => {
    expect(stepZoom(2, -1)).toBe(2);
    expect(stepZoom(2, 1)).toBe(3);
    expect(stepZoom(3, 1)).toBe(4);
    expect(stepZoom(4, 1)).toBe(4);
  });

  it('CA-80: zoom anchors on the cursor (world point under it stays within one art pixel)', () => {
    const v = vp(1600, 900, 1);
    const cam: CameraState = { cx: 512, cy: 416, zoom: 2 };
    const anchor = { x: 1200, y: 300 };
    const before = screenToWorld(computeView(cam, v, WORLD), anchor.x, anchor.y);
    const zoomed = zoomAt(cam, 1, anchor, v, WORLD);
    expect(zoomed.zoom).toBe(3);
    const after = screenToWorld(computeView(zoomed, v, WORLD), anchor.x, anchor.y);
    expect(Math.abs(after.x - before.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(1);
  });

  it('CA-80: zooming past the limit returns the same camera', () => {
    const v = vp(1600, 900, 1);
    const cam: CameraState = { cx: 512, cy: 416, zoom: 4 };
    expect(zoomAt(cam, 1, { x: 10, y: 10 }, v, WORLD)).toBe(cam);
  });

  it('CA-80: drag pans the content with the pointer and clamps at the map edge', () => {
    const v = vp(1280, 720, 1);
    const cam = clampCamera({ cx: 512, cy: 416, zoom: 2 }, v, WORLD);
    const moved = panBy(cam, 100, 0, v, WORLD);
    expect(moved.cx).toBeCloseTo(cam.cx - 50, 6);
    const far = panBy(cam, 100000, 100000, v, WORLD);
    expect(far.cx).toBeCloseTo(1280 / 2 / 2, 6); // half the visible width in art pixels
  });
});

describe('follow and centre', () => {
  it('CA-80: follow converges on the target and is frame-rate independent', () => {
    const v = vp(800, 600, 1);
    const target = { x: 600, y: 500 };
    let a: CameraState = { cx: 300, cy: 300, zoom: 2 };
    let b = a;
    for (let i = 0; i < 30; i++) a = followStep(a, target, 1000 / 30, v, WORLD);
    for (let i = 0; i < 60; i++) b = followStep(b, target, 1000 / 60, v, WORLD);
    expect(Math.abs(a.cx - b.cx)).toBeLessThan(0.01);
    expect(Math.abs(a.cx - target.x)).toBeLessThan(5);
  });

  it('CA-07: a huge dt (aborted tab) cannot make the camera overshoot', () => {
    const v = vp(800, 600, 1);
    const cam = followStep({ cx: 300, cy: 300, zoom: 2 }, { x: 600, y: 500 }, 60_000, v, WORLD);
    expect(cam.cx).toBeLessThanOrEqual(600);
    expect(cam.cx).toBeGreaterThan(300);
  });

  it('CA-22: reduced motion jumps straight to the target', () => {
    const v = vp(800, 600, 1);
    const cam = followStep({ cx: 300, cy: 300, zoom: 2 }, { x: 520, y: 410 }, 16, v, WORLD, true);
    expect(cam.cx).toBeCloseTo(520, 6);
    expect(cam.cy).toBeCloseTo(410, 6);
  });

  it('CA-80: centerOn shifts to the free area when a drawer covers the left side', () => {
    const v = vp(1600, 900, 1);
    const plain = centerOn({ cx: 0, cy: 0, zoom: 2 }, 500, 400, v, WORLD);
    const withDrawer = centerOn({ cx: 0, cy: 0, zoom: 2 }, 500, 400, v, WORLD, {
      left: 320,
      right: 0,
      top: 0,
      bottom: 0,
    });
    expect(plain.cx).toBeCloseTo(500, 6);
    expect(withDrawer.cx).toBeCloseTo(500 - 320 / 2 / 2, 6);
  });
});
