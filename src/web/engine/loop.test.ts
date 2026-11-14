import { describe, expect, it } from 'vitest';
import { createFrameLoop, HARD_FPS_CAP, type LoopTimers } from './loop';

/** Deterministic clock: rAF fires on the display's vsync grid, timeouts at their due time. */
function createHarness(vsyncHz: number) {
  let now = 0;
  let nextId = 1;
  const rafs = new Map<number, (t: number) => void>();
  const timeouts = new Map<number, { at: number; cb: () => void }>();
  const vsync = 1000 / vsyncHz;
  const timers: LoopTimers = {
    now: () => now,
    raf: (cb) => {
      const id = nextId++;
      rafs.set(id, cb);
      return id;
    },
    caf: (id) => void rafs.delete(id),
    setTimeout: (cb, ms) => {
      const id = nextId++;
      timeouts.set(id, { at: now + ms, cb });
      return id;
    },
    clearTimeout: (id) => void timeouts.delete(id),
  };
  const advanceTo = (end: number) => {
    while (now < end) {
      const nextVsync = Math.ceil((now + 1e-9) / vsync) * vsync;
      let nextTimeout = Infinity;
      for (const t of timeouts.values()) nextTimeout = Math.min(nextTimeout, t.at);
      const next = Math.min(nextVsync, nextTimeout, end);
      now = next;
      for (const [id, t] of [...timeouts]) {
        if (t.at <= now) {
          timeouts.delete(id);
          t.cb();
        }
      }
      if (Math.abs(now - nextVsync) < 1e-6) {
        const cbs = [...rafs.values()];
        rafs.clear();
        for (const cb of cbs) cb(now);
      }
    }
  };
  return { timers, advanceTo, now: () => now };
}

function maxPerSecond(times: number[]): number {
  let max = 0;
  for (let i = 0; i < times.length; i++) {
    let count = 0;
    for (let j = i; j < times.length && (times[j] as number) - (times[i] as number) < 1000; j++)
      count++;
    max = Math.max(max, count);
  }
  return max;
}

describe('frame loop', () => {
  it.each([60, 75, 120, 144, 240])(
    'CA-06: never renders more than 30 frames in any 1 s window on a %i Hz display',
    (hz) => {
      const h = createHarness(hz);
      const times: number[] = [];
      const loop = createFrameLoop({
        timers: h.timers,
        isHidden: () => false,
        wantsFast: () => true,
        render: (_dt, now) => void times.push(now),
      });
      loop.start();
      h.advanceTo(60_000);
      expect(times.length).toBeGreaterThan(60 * 20); // still smooth, not starved
      expect(maxPerSecond(times)).toBeLessThanOrEqual(HARD_FPS_CAP);
    },
  );

  it('CA-06: a fastFps option above the cap is clamped to 30', () => {
    const h = createHarness(240);
    const times: number[] = [];
    const loop = createFrameLoop({
      timers: h.timers,
      fastFps: 120,
      isHidden: () => false,
      wantsFast: () => true,
      render: (_dt, now) => void times.push(now),
    });
    loop.start();
    h.advanceTo(10_000);
    expect(maxPerSecond(times)).toBeLessThanOrEqual(30);
  });

  it('CA-06: ambient-only animation runs at the slow rate (~10 fps)', () => {
    const h = createHarness(60);
    const times: number[] = [];
    const loop = createFrameLoop({
      timers: h.timers,
      isHidden: () => false,
      wantsFast: () => false,
      slowFps: () => 10,
      render: (_dt, now) => void times.push(now),
    });
    loop.start();
    h.advanceTo(30_000);
    const perSecond = times.length / 30;
    expect(perSecond).toBeGreaterThan(8);
    expect(perSecond).toBeLessThanOrEqual(10.5);
  });

  it('CA-07: renders zero frames while hidden and resumes immediately with a clamped dt', () => {
    const h = createHarness(60);
    let hidden = false;
    const dts: number[] = [];
    const times: number[] = [];
    const loop = createFrameLoop({
      timers: h.timers,
      isHidden: () => hidden,
      wantsFast: () => true,
      render: (dt, now) => {
        dts.push(dt);
        times.push(now);
      },
    });
    loop.start();
    h.advanceTo(2_000);
    const before = loop.stats.rendered;

    hidden = true;
    loop.stop(); // what the engine does on visibilitychange
    h.advanceTo(62_000); // a minute in the background
    expect(loop.stats.rendered).toBe(before);
    expect(loop.stats.renderedWhileHidden).toBe(0);

    hidden = false;
    loop.start();
    h.advanceTo(62_000 + 500);
    const afterResume = times.filter((t) => t > 62_000);
    expect(afterResume.length).toBeGreaterThan(0);
    expect((afterResume[0] as number) - 62_000).toBeLessThanOrEqual(500);
    // The simulation never sees the minute that was spent hidden.
    expect(Math.max(...dts)).toBeLessThanOrEqual(100);
  });

  it('CA-07: a tick that fires after the tab became hidden does not render', () => {
    const h = createHarness(60);
    let hidden = false;
    let renders = 0;
    const loop = createFrameLoop({
      timers: h.timers,
      isHidden: () => hidden,
      wantsFast: () => true,
      render: () => void renders++,
    });
    loop.start();
    h.advanceTo(500);
    hidden = true; // no stop(): the browser may still deliver one pending rAF
    const frozen = renders;
    h.advanceTo(5_000);
    expect(renders).toBe(frozen);
    expect(loop.stats.renderedWhileHidden).toBe(0);
  });

  it('CA-06: wake() renders sooner than the slow interval when something starts moving', () => {
    const h = createHarness(60);
    let fast = false;
    const times: number[] = [];
    const loop = createFrameLoop({
      timers: h.timers,
      isHidden: () => false,
      wantsFast: () => fast,
      slowFps: () => 2,
      render: (_dt, now) => void times.push(now),
    });
    loop.start();
    h.advanceTo(1_000);
    const n = times.length;
    fast = true;
    loop.wake();
    h.advanceTo(1_100);
    expect(times.length).toBeGreaterThan(n);
  });
});
