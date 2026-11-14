// OfficeEngine: owns the canvas, the frame loop, the camera, input and the renderer. React only
// mounts it (see OfficeView) and talks to it through this small API.

import {
  centerOn,
  clampCamera,
  computeView,
  DEFAULT_ZOOM,
  followStep,
  panBy,
  screenToWorld,
  setZoom,
  zoomAt,
  type CameraState,
  type ViewRect,
  type ZoomLevel,
} from '../../shared/world/camera';
import { ambientTint, brasiliaMinutes, dayPhase, type DayPhase } from '../../shared/world/clock';
import { createFrameLoop, type FrameLoop } from './loop';
import { toPickables } from './sprites';
import { pickSprite } from './picking';
import { fixedZoneLevels } from './lighting';
import {
  createQualityController,
  percentile,
  QUALITY_FEATURES,
  type QualityLevel,
  type QualitySetting,
} from './quality';
import { Canvas2DRenderer } from './renderer';
import type { Simulation } from './demo';
import type { LoadedWorld } from './world/loadWorld';
import { roomCameraPoint } from './world/world';

export interface EngineOptions {
  canvas: HTMLCanvasElement;
  loaded: LoadedWorld;
  simulation?: Simulation;
  zoom?: ZoomLevel;
  /** Simulated studio time (`?debugTime=`): the clock starts here and keeps running. */
  debugTime?: Date;
  reducedMotion?: () => boolean;
  /** Keep every rendered frame timestamp (debug/e2e: verifies the 30 fps cap exactly). */
  logFrames?: boolean;
  /** Dirty-region rendering (default true). */
  dirtyRegions?: boolean;
  quality?: QualitySetting;
  /** Force rain on (the S-02 spike) regardless of weather logic. */
  rain?: boolean;
  onZoomChange?: (zoom: ZoomLevel) => void;
  onFollowChange?: (id: string | null) => void;
  /** A click (not a drag) on the map: the NPC under it, or null on empty floor. */
  onNpcClick?: (id: string | null) => void;
  /** Called only when the hovered NPC changes. */
  onNpcHover?: (id: string | null) => void;
}

export interface EngineMetrics {
  rendered: number;
  renderedWhileHidden: number;
  /** Frames rendered in the last 1 000 ms. */
  fps: number;
  frameMsP50: number;
  frameMsP95: number;
  quality: QualityLevel;
  zoom: ZoomLevel;
  scale: number;
  dpr: number;
  canvasWidth: number;
  canvasHeight: number;
  sprites: number;
  following: string | null;
}

const KEY_PAN_PX = 24;
const WHEEL_STEP_MS = 140;
const DRAG_THRESHOLD_CSS_PX = 4;

export class OfficeEngine {
  private readonly canvas: HTMLCanvasElement;
  private readonly loaded: LoadedWorld;
  private readonly renderer: Canvas2DRenderer;
  private readonly loop: FrameLoop;
  private readonly quality = createQualityController();
  private readonly sim?: Simulation;
  private readonly clockOffsetMs: number;
  private readonly reducedMotion: () => boolean;
  private readonly forceRain: boolean;
  private readonly onZoomChange?: EngineOptions['onZoomChange'];
  private readonly onFollowChange?: EngineOptions['onFollowChange'];
  private readonly onNpcClick?: EngineOptions['onNpcClick'];
  private readonly onNpcHover?: EngineOptions['onNpcHover'];
  private readonly resizeObserver: ResizeObserver;

  private camera: CameraState;
  private lastView: ViewRect | null = null;
  private followId: string | null = null;
  private dragging = false;
  private dragMoved = false;
  private dragStart = { x: 0, y: 0 };
  private lastPointer = { x: 0, y: 0 };
  private lastWheelAt = 0;
  private hoverId: string | null = null;
  private ambientAt = -Infinity;
  private ambient = { r: 255, g: 255, b: 255, a: 0 };
  private phase: DayPhase = 'day';
  private zoneLevels = new Map<string, 'lit' | 'dim' | 'off'>();
  private frameTimes: number[] = [];
  private renderStamps: number[] = [];
  private readonly frameLog: number[] | null;
  private nextSprites: ReturnType<Simulation['sprites']> = [];
  private cameraMoving = false;
  private destroyed = false;
  private readonly onVisibility: () => void;

  constructor(options: EngineOptions) {
    this.canvas = options.canvas;
    this.loaded = options.loaded;
    this.sim = options.simulation;
    this.reducedMotion = options.reducedMotion ?? (() => false);
    this.forceRain = options.rain ?? false;
    this.frameLog = options.logFrames ? [] : null;
    this.onZoomChange = options.onZoomChange;
    this.onFollowChange = options.onFollowChange;
    this.onNpcClick = options.onNpcClick;
    this.onNpcHover = options.onNpcHover;
    this.clockOffsetMs = options.debugTime ? options.debugTime.getTime() - Date.now() : 0;
    this.quality.setSetting(options.quality ?? 'auto');
    this.zoneLevels = fixedZoneLevels(this.loaded.world.map.lightZones);

    const { world, atlas } = this.loaded;
    this.renderer = new Canvas2DRenderer(this.canvas, world, atlas, options.dirtyRegions ?? true);
    this.camera = {
      cx: world.widthPx / 2,
      cy: world.heightPx / 2,
      zoom: options.zoom ?? DEFAULT_ZOOM,
    };

    this.canvas.style.imageRendering = 'pixelated';
    this.canvas.tabIndex = 0;
    this.attachInput();
    this.resizeObserver = new ResizeObserver((entries) => this.onResize(entries[0]));
    this.resizeObserver.observe(this.canvas, { box: 'device-pixel-content-box' });

    this.loop = createFrameLoop({
      isHidden: () => document.visibilityState === 'hidden',
      wantsFast: () => this.wantsFast(),
      fastFps: () => this.fastFps(),
      slowFps: () => QUALITY_FEATURES[this.quality.level].ambientFps,
      render: (dt, now) => this.renderFrame(dt, now),
    });
    this.onVisibility = () => {
      if (document.visibilityState === 'hidden') this.loop.stop();
      else if (!this.destroyed) {
        this.syncSize();
        this.loop.start();
      }
    };
    document.addEventListener('visibilitychange', this.onVisibility);
    this.syncSize(); // needs the loop (it wakes it)
  }

  start(): void {
    if (document.visibilityState !== 'hidden') this.loop.start();
  }

  destroy(): void {
    this.destroyed = true;
    this.loop.stop();
    this.resizeObserver.disconnect();
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.detachInput();
  }

  // --- Camera API ---------------------------------------------------------------------------

  get zoom(): ZoomLevel {
    return this.camera.zoom;
  }

  setZoomLevel(zoom: ZoomLevel): void {
    this.camera = setZoom(this.camera, zoom, this.renderer.viewport, this.worldSize());
    this.onZoomChange?.(this.camera.zoom);
    this.loop.wake();
  }

  zoomBy(direction: 1 | -1, anchorCss?: { x: number; y: number }): void {
    const dpr = this.renderer.viewport.dpr;
    const anchor = anchorCss
      ? { x: anchorCss.x * dpr, y: anchorCss.y * dpr }
      : { x: this.renderer.viewport.width / 2, y: this.renderer.viewport.height / 2 };
    this.camera = zoomAt(this.camera, direction, anchor, this.renderer.viewport, this.worldSize());
    this.onZoomChange?.(this.camera.zoom);
    this.loop.wake();
  }

  centerOnRoom(
    roomId: string,
    insets?: { left: number; right: number; top: number; bottom: number },
  ): boolean {
    const point = roomCameraPoint(this.loaded.world, roomId);
    if (!point) return false;
    this.follow(null);
    this.camera = centerOn(
      this.camera,
      point.x,
      point.y,
      this.renderer.viewport,
      this.worldSize(),
      insets,
    );
    this.loop.wake();
    return true;
  }

  centerOnTile(tx: number, ty: number): void {
    this.follow(null);
    this.camera = centerOn(
      this.camera,
      (tx + 0.5) * 16,
      (ty + 0.5) * 16,
      this.renderer.viewport,
      this.worldSize(),
    );
    this.loop.wake();
  }

  follow(id: string | null): void {
    if (id === this.followId) return;
    this.followId = id;
    this.onFollowChange?.(id);
    this.loop.wake();
  }

  /** Ask for a frame soon (the simulation state changed from outside). */
  wake(): void {
    this.loop.wake();
  }

  get following(): string | null {
    return this.followId;
  }

  // --- Info -----------------------------------------------------------------------------------

  metrics(): EngineMetrics {
    const now = performance.now();
    const view = this.lastView;
    return {
      rendered: this.loop.stats.rendered,
      renderedWhileHidden: this.loop.stats.renderedWhileHidden,
      fps: this.renderStamps.filter((t) => now - t <= 1000).length,
      frameMsP50: percentile(this.frameTimes, 0.5),
      frameMsP95: percentile(this.frameTimes, 0.95),
      quality: this.quality.level,
      zoom: this.camera.zoom,
      scale: view?.scale ?? 0,
      dpr: this.renderer.viewport.dpr,
      canvasWidth: this.renderer.viewport.width,
      canvasHeight: this.renderer.viewport.height,
      sprites: this.nextSprites.length,
      following: this.followId,
    };
  }

  /** Timestamps (ms) of every rendered frame since start, when constructed with logFrames. */
  frameTimestamps(): number[] {
    return this.frameLog ? [...this.frameLog] : [];
  }

  /** Positions of the dynamic sprites after the last frame (debug and e2e). */
  debugSprites(): { id: string; x: number; y: number }[] {
    return this.nextSprites.map((s) => ({ id: s.id, x: s.x, y: s.y }));
  }

  /** Clears the rolling frame-time window (the spike starts each scenario with a clean slate). */
  resetMetrics(): void {
    this.frameTimes = [];
    this.renderStamps = [];
  }

  get atlas(): LoadedWorld['atlas'] {
    return this.loaded.atlas;
  }

  /** Centres the camera on a world point (minimap click, "go to desk"). */
  centerOnWorld(x: number, y: number): void {
    this.follow(null);
    this.camera = centerOn(this.camera, x, y, this.renderer.viewport, this.worldSize());
    this.loop.wake();
  }

  /** Client (CSS) pixel of a world point, or null before the first frame. Anchors the hover card. */
  clientPointOfWorld(wx: number, wy: number): { x: number; y: number } | null {
    const view = this.lastView;
    if (!view) return null;
    const r = this.canvas.getBoundingClientRect();
    const dpr = this.renderer.viewport.dpr;
    return {
      x: r.left + (view.originX + wx * view.scale) / dpr,
      y: r.top + (view.originY + wy * view.scale) / dpr,
    };
  }

  /** Head anchor of a sprite (by id) in client pixels, for the hover card. */
  anchorOfSprite(id: string): { x: number; y: number } | null {
    const s = this.nextSprites.find((n) => n.id === id);
    return s ? this.clientPointOfWorld(s.x + 8, s.y - 12) : null;
  }

  /** Visible world area in world pixels (minimap viewport box). */
  viewWorldRect(): { x: number; y: number; w: number; h: number } | null {
    const view = this.lastView;
    if (!view) return null;
    const vp = this.renderer.viewport;
    return {
      x: -view.originX / view.scale,
      y: -view.originY / view.scale,
      w: vp.width / view.scale,
      h: vp.height / view.scale,
    };
  }

  /** Static base (floor, walls, furniture) for the minimap. */
  get minimapBase(): CanvasImageSource {
    return this.renderer.baseCanvas;
  }

  get world(): LoadedWorld['world'] {
    return this.loaded.world;
  }

  get diagnostics(): string[] {
    return this.loaded.diagnostics;
  }

  /**
   * Crispness check (R4/CA-80): every colour on the presented canvas must already exist in the 1x
   * world buffer (or be the page background), i.e. scaling introduced no interpolated colours.
   */
  crispness(): { worldColors: number; presentedColors: number; foreign: number } {
    const read = (
      canvas: CanvasImageSource & { width: number; height: number },
      ctx: { getImageData: CanvasRenderingContext2D['getImageData'] },
    ) => ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const worldBuf = this.renderer.buffer;
    const world = read(
      worldBuf.canvas as HTMLCanvasElement,
      worldBuf.ctx as CanvasRenderingContext2D,
    );
    const shown = read(this.canvas, this.canvas.getContext('2d') as CanvasRenderingContext2D);
    const key = (d: Uint8ClampedArray, i: number) =>
      ((d[i] as number) << 16) | ((d[i + 1] as number) << 8) | (d[i + 2] as number);
    const known = new Set<number>([0x1f1a17]);
    for (let i = 0; i < world.length; i += 4) known.add(key(world, i));
    const seen = new Set<number>();
    let foreign = 0;
    for (let i = 0; i < shown.length; i += 4) {
      const k = key(shown, i);
      if (!seen.has(k)) {
        seen.add(k);
        if (!known.has(k)) foreign++;
      }
    }
    return { worldColors: known.size, presentedColors: seen.size, foreign };
  }

  // --- Internals ------------------------------------------------------------------------------

  private worldSize() {
    return { width: this.loaded.world.widthPx, height: this.loaded.world.heightPx };
  }

  /** 20 fps while only a few NPCs walk (nothing else moving); 30 fps otherwise (CA-06 cap). */
  private fastFps(): number {
    if (this.dragging || this.followId !== null || this.cameraMoving) return 30;
    const walking = this.sim?.movingCount?.();
    return walking !== undefined && walking <= 3 ? 20 : 30;
  }

  private wantsFast(): boolean {
    return (
      this.dragging || this.followId !== null || this.cameraMoving || (this.sim?.moving() ?? false)
    );
  }

  private syncSize(): void {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.applySize(Math.round(rect.width * dpr), Math.round(rect.height * dpr), dpr);
  }

  private onResize(entry: ResizeObserverEntry | undefined): void {
    const dpr = window.devicePixelRatio || 1;
    const box = entry?.devicePixelContentBoxSize?.[0];
    const css = entry?.contentRect;
    // The device-pixel box is exact on real displays (fractional zoom/scale), but device emulation
    // can report a box that disagrees with devicePixelRatio. Trust it only when consistent.
    const consistent =
      box &&
      css &&
      Math.abs(box.inlineSize - css.width * dpr) <= 2 &&
      Math.abs(box.blockSize - css.height * dpr) <= 2;
    if (box && consistent) this.applySize(box.inlineSize, box.blockSize, dpr);
    else this.syncSize();
  }

  private applySize(w: number, h: number, dpr: number): void {
    if (w < 1 || h < 1) return;
    this.renderer.resize(w, h, dpr);
    this.camera = clampCamera(this.camera, this.renderer.viewport, this.worldSize());
    this.loop.wake();
    // The canvas bitmap was just reset: repaint right away instead of waiting for the next tick.
    if (!this.destroyed && document.visibilityState !== 'hidden' && this.loop.stats.running)
      this.drawNow();
  }

  private studioDate(): Date {
    return new Date(Date.now() + this.clockOffsetMs);
  }

  private updateAmbient(now: number): void {
    if (now - this.ambientAt < 30_000) return;
    this.ambientAt = now;
    const minutes = brasiliaMinutes(this.studioDate());
    this.ambient = ambientTint(minutes);
    this.phase = dayPhase(minutes);
  }

  private drawNow(): void {
    this.lastView = this.renderer.render({
      camera: this.camera,
      sprites: this.nextSprites,
      ambient: this.ambient,
      zoneLevels: this.zoneLevels,
      phase: this.phase,
      rain: false,
      timeMs: performance.now(),
    });
  }

  private renderFrame(dtMs: number, now: number): void {
    const t0 = performance.now();
    this.updateAmbient(now);
    this.sim?.update(dtMs);
    this.nextSprites = this.sim?.sprites() ?? [];

    // Follow: pull the camera toward the followed sprite.
    this.cameraMoving = false;
    if (this.followId) {
      const target = this.nextSprites.find((s) => s.id === this.followId);
      if (target) {
        const next = followStep(
          this.camera,
          { x: target.x + 8, y: target.y },
          dtMs,
          this.renderer.viewport,
          this.worldSize(),
          this.reducedMotion(),
        );
        this.cameraMoving =
          Math.abs(next.cx - this.camera.cx) + Math.abs(next.cy - this.camera.cy) > 0.05;
        this.camera = next;
      } else this.follow(null);
    }

    const features = QUALITY_FEATURES[this.quality.level];
    this.lastView = this.renderer.render({
      camera: this.camera,
      sprites: this.nextSprites,
      ambient: this.ambient,
      zoneLevels: this.zoneLevels,
      phase: this.phase,
      rain: this.forceRain && features.rain && !this.reducedMotion(),
      timeMs: now,
    });

    const spent = performance.now() - t0;
    this.frameTimes.push(spent);
    if (this.frameTimes.length > 600) this.frameTimes.shift();
    this.renderStamps.push(now);
    if (this.frameLog && this.frameLog.length < 50_000) this.frameLog.push(now);
    if (this.renderStamps.length > 120) this.renderStamps.shift();
    this.quality.record(spent);
  }

  // --- Input ----------------------------------------------------------------------------------

  private readonly handlers = {
    pointerdown: (e: PointerEvent) => this.pointerDown(e),
    pointermove: (e: PointerEvent) => this.pointerMove(e),
    pointerup: (e: PointerEvent) => this.pointerUp(e),
    pointercancel: (e: PointerEvent) => this.pointerUp(e),
    pointerleave: () => this.setHover(null),
    wheel: (e: WheelEvent) => this.wheel(e),
    keydown: (e: KeyboardEvent) => this.keyDown(e),
  };

  private attachInput(): void {
    const c = this.canvas;
    c.addEventListener('pointerdown', this.handlers.pointerdown);
    c.addEventListener('pointermove', this.handlers.pointermove);
    c.addEventListener('pointerup', this.handlers.pointerup);
    c.addEventListener('pointercancel', this.handlers.pointercancel);
    c.addEventListener('pointerleave', this.handlers.pointerleave);
    c.addEventListener('wheel', this.handlers.wheel, { passive: false });
    c.addEventListener('keydown', this.handlers.keydown);
  }

  private detachInput(): void {
    const c = this.canvas;
    c.removeEventListener('pointerdown', this.handlers.pointerdown);
    c.removeEventListener('pointermove', this.handlers.pointermove);
    c.removeEventListener('pointerup', this.handlers.pointerup);
    c.removeEventListener('pointercancel', this.handlers.pointercancel);
    c.removeEventListener('pointerleave', this.handlers.pointerleave);
    c.removeEventListener('wheel', this.handlers.wheel);
    c.removeEventListener('keydown', this.handlers.keydown);
  }

  private cssPoint(e: { clientX: number; clientY: number }): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private pickAt(cssX: number, cssY: number): string | null {
    if (!this.lastView) return null;
    const dpr = this.renderer.viewport.dpr;
    const w = screenToWorld(this.lastView, cssX * dpr, cssY * dpr);
    return pickSprite(toPickables(this.nextSprites, this.loaded.atlas), w.x, w.y);
  }

  private pointerDown(e: PointerEvent): void {
    if (e.button !== 0) return;
    this.canvas.setPointerCapture(e.pointerId);
    this.dragging = true;
    this.dragMoved = false;
    this.dragStart = this.cssPoint(e);
    this.lastPointer = this.dragStart;
  }

  private pointerMove(e: PointerEvent): void {
    const p = this.cssPoint(e);
    if (this.dragging) {
      if (
        !this.dragMoved &&
        Math.hypot(p.x - this.dragStart.x, p.y - this.dragStart.y) < DRAG_THRESHOLD_CSS_PX
      )
        return;
      this.dragMoved = true;
      this.follow(null);
      const dpr = this.renderer.viewport.dpr;
      this.camera = panBy(
        this.camera,
        (p.x - this.lastPointer.x) * dpr,
        (p.y - this.lastPointer.y) * dpr,
        this.renderer.viewport,
        this.worldSize(),
      );
      this.lastPointer = p;
      this.canvas.style.cursor = 'grabbing';
      this.loop.wake();
      return;
    }
    this.setHover(this.pickAt(p.x, p.y));
  }

  private pointerUp(e: PointerEvent): void {
    if (!this.dragging) return;
    this.dragging = false;
    if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
    this.canvas.style.cursor = this.hoverId ? 'pointer' : '';
    if (!this.dragMoved && e.type === 'pointerup') {
      const p = this.cssPoint(e);
      const id = this.pickAt(p.x, p.y);
      this.onNpcClick?.(id);
    }
    this.loop.wake();
  }

  private setHover(id: string | null): void {
    if (id === this.hoverId) return;
    this.hoverId = id;
    this.canvas.style.cursor = id ? 'pointer' : '';
    this.onNpcHover?.(id);
  }

  private wheel(e: WheelEvent): void {
    e.preventDefault();
    const now = performance.now();
    if (now - this.lastWheelAt < WHEEL_STEP_MS || e.deltaY === 0) return;
    this.lastWheelAt = now;
    this.zoomBy(e.deltaY < 0 ? 1 : -1, this.cssPoint(e));
  }

  private keyDown(e: KeyboardEvent): void {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const dpr = this.renderer.viewport.dpr;
    const step = KEY_PAN_PX * dpr * 2;
    let handled = true;
    switch (e.key) {
      case 'ArrowLeft':
        this.pan(step, 0);
        break;
      case 'ArrowRight':
        this.pan(-step, 0);
        break;
      case 'ArrowUp':
        this.pan(0, step);
        break;
      case 'ArrowDown':
        this.pan(0, -step);
        break;
      case '+':
      case '=':
        this.zoomBy(1);
        break;
      case '-':
        this.zoomBy(-1);
        break;
      case 'Escape':
        if (this.followId) this.follow(null);
        else handled = false;
        break;
      default:
        handled = false;
    }
    if (handled) e.preventDefault();
  }

  private pan(dxDev: number, dyDev: number): void {
    this.follow(null);
    this.camera = panBy(this.camera, dxDev, dyDev, this.renderer.viewport, this.worldSize());
    this.loop.wake();
  }

  /** For tests and the spike: where a world tile currently is on the canvas, in CSS px. */
  tileToCss(tx: number, ty: number): { x: number; y: number } | null {
    const view =
      this.lastView ?? computeView(this.camera, this.renderer.viewport, this.worldSize());
    const dpr = this.renderer.viewport.dpr;
    return {
      x: (view.originX + tx * 16 * view.scale) / dpr,
      y: (view.originY + ty * 16 * view.scale) / dpr,
    };
  }
}
