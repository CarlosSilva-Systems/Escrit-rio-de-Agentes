import { describe, expect, it } from 'vitest';
import valid from '../../../tests/fixtures/uso/valid.json';
import suspect from '../../../tests/fixtures/uso/five-hour-only-suspect.json';
import wrongSchema from '../../../tests/fixtures/uso/wrong-schema.json';
import badWindow from '../../../tests/fixtures/uso/bad-window.json';
import { UsoSchema } from './uso';

describe('uso/v1 contract', () => {
  it('CA-56: accepts a full reading with both windows', () => {
    const parsed = UsoSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.windows.fiveHour?.usedPercentage).toBe(42);
    expect(parsed.data?.windows.sevenDay?.resetsAt).toBe(1794900000);
  });

  it('CA-58: a window may be absent', () => {
    const parsed = UsoSchema.safeParse(suspect);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.windows.sevenDay).toBeUndefined();
  });

  it('CA-56: out-of-range percentages are accepted here (the UI clamps and flags them)', () => {
    expect(UsoSchema.parse(suspect).windows.fiveHour?.usedPercentage).toBe(120);
  });

  it('CA-57: keeps the stale flag', () => {
    expect(UsoSchema.parse(suspect).windows.fiveHour?.stale).toBe(true);
  });

  it('CA-62: spendLimit and extraWindows are optional pass-through', () => {
    const withExtras = UsoSchema.safeParse({
      ...valid,
      spendLimit: { limit: 10, used: 2 },
      extraWindows: { opus: { usedPercentage: 5, resetsAt: 1794900000 } },
    });
    expect(withExtras.success).toBe(true);
    const { spendLimit: _s, extraWindows: _e, ...bare } = valid;
    expect(UsoSchema.safeParse(bare).success).toBe(true);
  });

  it('CA-58: ignores unknown fields', () => {
    expect(UsoSchema.safeParse({ ...valid, future: true }).success).toBe(true);
  });

  it('CA-58: rejects another schema version', () => {
    expect(UsoSchema.safeParse(wrongSchema).success).toBe(false);
  });

  it('CA-58: rejects a non-numeric percentage', () => {
    expect(UsoSchema.safeParse(badWindow).success).toBe(false);
  });

  it('CA-58: rejects NaN and a missing resetsAt', () => {
    expect(
      UsoSchema.safeParse({
        ...valid,
        windows: { fiveHour: { usedPercentage: Number.NaN, resetsAt: 1 } },
      }).success,
    ).toBe(false);
    expect(
      UsoSchema.safeParse({ ...valid, windows: { fiveHour: { usedPercentage: 1 } } }).success,
    ).toBe(false);
  });
});
