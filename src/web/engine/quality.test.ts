import { describe, expect, it } from 'vitest';
import { createQualityController, percentile, QUALITY_FEATURES } from './quality';

const feed = (q: ReturnType<typeof createQualityController>, ms: number, n: number) => {
  for (let i = 0; i < n; i++) q.record(ms);
};

describe('quality controller', () => {
  it('CA-81: percentile picks the nearest rank', () => {
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.95)).toBe(10);
    expect(percentile([], 0.95)).toBe(0);
  });

  it('CA-81: starts high and drops one level per over-budget window (effects first)', () => {
    const q = createQualityController({ budgetMs: 8, window: 20 });
    expect(q.level).toBe('high');
    feed(q, 14, 20);
    expect(q.level).toBe('medium');
    expect(QUALITY_FEATURES[q.level].rain).toBe(false);
    expect(QUALITY_FEATURES[q.level].flicker).toBe(true);
    feed(q, 14, 20);
    expect(q.level).toBe('low');
    feed(q, 14, 20);
    expect(q.level).toBe('low');
    expect(QUALITY_FEATURES.low.ambientFps).toBeLessThan(QUALITY_FEATURES.high.ambientFps);
  });

  it('CA-81: ignores a single slow frame (p95) and recovers only after several good windows', () => {
    const q = createQualityController({ budgetMs: 8, window: 20, recoverWindows: 3 });
    feed(q, 14, 20);
    expect(q.level).toBe('medium');
    for (let i = 0; i < 2; i++) feed(q, 1, 20);
    expect(q.level).toBe('medium');
    feed(q, 1, 20);
    expect(q.level).toBe('high');

    const spike = createQualityController({ budgetMs: 8, window: 20 });
    feed(spike, 2, 19);
    spike.record(60);
    expect(spike.level).toBe('high');
  });

  it('CA-81: a fixed setting is never changed by frame times', () => {
    const q = createQualityController({ window: 10 });
    q.setSetting('medium');
    feed(q, 50, 100);
    expect(q.level).toBe('medium');
    q.setSetting('auto');
    feed(q, 50, 10);
    expect(q.level).toBe('low');
  });
});
