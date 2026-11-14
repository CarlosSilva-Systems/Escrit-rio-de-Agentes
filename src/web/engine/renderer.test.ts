import { describe, expect, it } from 'vitest';
import { mergeRects } from './renderer';

describe('dirty-region merging', () => {
  it('CA-08: separate rects stay separate, overlapping or touching ones merge', () => {
    expect(
      mergeRects([
        [0, 0, 10, 10],
        [50, 50, 10, 10],
      ]),
    ).toHaveLength(2);
    expect(
      mergeRects([
        [0, 0, 10, 10],
        [5, 5, 10, 10],
      ]),
    ).toEqual([[0, 0, 15, 15]]);
    expect(
      mergeRects([
        [0, 0, 10, 10],
        [10, 0, 10, 10],
      ]),
    ).toEqual([[0, 0, 20, 10]]);
  });

  it('CA-08: chains merge transitively and empty rects are dropped', () => {
    const out = mergeRects([
      [0, 0, 10, 10],
      [8, 0, 10, 10],
      [16, 0, 10, 10],
      [100, 100, 0, 5],
    ]);
    expect(out).toEqual([[0, 0, 26, 10]]);
  });

  it('CA-08: every input pixel stays covered by the merged result', () => {
    const input: [number, number, number, number][] = [
      [3, 3, 7, 7],
      [9, 2, 5, 5],
      [40, 40, 4, 4],
    ];
    const out = mergeRects(input);
    for (const [x, y, w, h] of input) {
      expect(
        out.some((o) => o[0] <= x && o[1] <= y && o[0] + o[2] >= x + w && o[1] + o[3] >= y + h),
      ).toBe(true);
    }
  });
});
