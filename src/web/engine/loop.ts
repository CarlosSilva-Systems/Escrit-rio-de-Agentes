// Frame loop (ADR-0002 §5): hard cap of 30 rendered frames per second, adaptive rate (fast while
// something moves, slow when only ambient animation runs), total stop while the tab is hidden,
// `dt` clamped so nothing jumps on resume. All timers are injectable for tests.

export interface LoopTimers {
  raf: (cb: (timestamp: number) => void) => number;
  caf: (id: number) => void;
  setTimeout: (cb: () => void, ms: number) => number;
  clearTimeout: (id: number) => void;
  now: () => number;
}

export interface LoopOptions {
  /** Called only when a frame is due. `dtMs` is clamped to `maxDtMs`. */
  render: (dtMs: number, nowMs: number) => void;
  isHidden: () => boolean;
  /** True while anything moves (walking NPCs, camera pan/follow, particles). */
  wantsFast: () => boolean;
  /** Rendering rate while something moves (may vary, e.g. 20 for a few walkers). Never above `HARD_FPS_CAP`. */
  fastFps?: number | (() => number);
  /** Rendering rate when only ambient animation runs. */
  slowFps?: () => number;
  maxDtMs?: number;
  timers?: LoopTimers;
}

/** CA-06: never more than this many rendered frames in any 1 s window. */
export const HARD_FPS_CAP = 30;

export interface LoopStats {
  /** Frames rendered since `start()` was first called. */
  rendered: number;
  /** Frames rendered while the tab was hidden (must stay 0, CA-07). */
  renderedWhileHidden: number;
  running: boolean;
}

export interface FrameLoop {
  start(): void;
  stop(): void;
  /** Ask for a frame as soon as the rate limit allows (input, state change). */
  wake(): void;
  readonly stats: LoopStats;
}

const browserTimers = (): LoopTimers => ({
  raf: (cb) => requestAnimationFrame(cb),
  caf: (id) => cancelAnimationFrame(id),
  setTimeout: (cb, ms) => window.setTimeout(cb, ms),
  clearTimeout: (id) => window.clearTimeout(id),
  now: () => performance.now(),
});

export function createFrameLoop(options: LoopOptions): FrameLoop {
  const timers = options.timers ?? browserTimers();
  const maxDt = options.maxDtMs ?? 100;
  const fastFpsOf = () => {
    const v =
      typeof options.fastFps === 'function' ? options.fastFps() : (options.fastFps ?? HARD_FPS_CAP);
    return Math.min(Math.max(1, v), HARD_FPS_CAP);
  };
  const slowFps = options.slowFps ?? (() => 10);
  const stats: LoopStats = { rendered: 0, renderedWhileHidden: 0, running: false };

  let rafId: number | null = null;
  let timeoutId: number | null = null;
  let lastRender = -Infinity;
  // Timestamps of the last HARD_FPS_CAP renders: a new render is allowed only if the oldest of them
  // is at least 1000 ms old, so any 1 s window holds at most HARD_FPS_CAP frames.
  const recent: number[] = [];

  const intervalMs = () => {
    const fast = fastFpsOf();
    return 1000 / (options.wantsFast() ? fast : Math.min(slowFps(), fast));
  };

  const rateLimitOk = (now: number) =>
    recent.length < HARD_FPS_CAP || now - (recent[recent.length - HARD_FPS_CAP] as number) >= 1000;

  const cancelPending = () => {
    if (rafId !== null) timers.caf(rafId);
    if (timeoutId !== null) timers.clearTimeout(timeoutId);
    rafId = null;
    timeoutId = null;
  };

  const schedule = () => {
    if (!stats.running || rafId !== null || timeoutId !== null) return;
    if (options.isHidden()) return;
    const wait = intervalMs() - (timers.now() - lastRender);
    if (wait > 24) {
      // Long waits (ambient-only) sleep on a timer instead of waking up 60 times a second.
      timeoutId = timers.setTimeout(() => {
        timeoutId = null;
        rafId = timers.raf(tick);
      }, wait - 12);
    } else {
      rafId = timers.raf(tick);
    }
  };

  const tick = () => {
    rafId = null;
    if (!stats.running) return;
    if (options.isHidden()) return; // fully stopped; `start()` resumes on visibilitychange
    const now = timers.now();
    const elapsed = now - lastRender;
    // 1.5 ms tolerance so a 60 Hz display lands on every 2nd vsync (33.3 ms) for 30 fps.
    if (elapsed >= intervalMs() - 1.5 && rateLimitOk(now)) {
      const dt = Math.min(Number.isFinite(elapsed) ? elapsed : 0, maxDt);
      lastRender = now;
      recent.push(now);
      if (recent.length > HARD_FPS_CAP * 2) recent.splice(0, recent.length - HARD_FPS_CAP);
      stats.rendered++;
      if (options.isHidden()) stats.renderedWhileHidden++;
      options.render(dt, now);
    }
    schedule();
  };

  return {
    stats,
    start() {
      if (stats.running && (rafId !== null || timeoutId !== null)) return;
      stats.running = true;
      // First frame after (re)start renders immediately: resume is <= 1 frame, dt stays clamped.
      lastRender = -Infinity;
      cancelPending();
      if (!options.isHidden()) rafId = timers.raf(tick);
    },
    stop() {
      stats.running = false;
      cancelPending();
    },
    wake() {
      if (!stats.running || options.isHidden()) return;
      if (timeoutId !== null) {
        timers.clearTimeout(timeoutId);
        timeoutId = null;
        rafId = timers.raf(tick);
      } else if (rafId === null) {
        schedule();
      }
    },
  };
}
