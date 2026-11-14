import { describe, expect, it } from 'vitest';
import { ambientTint, brasiliaMinutes, dayPhase, formatBrasiliaClock } from './clock';

describe('Brasília clock', () => {
  it('CA-74: uses America/Sao_Paulo (UTC-3) regardless of the machine time zone', () => {
    const noonUtc = new Date('2026-12-24T15:00:00Z');
    expect(brasiliaMinutes(noonUtc)).toBe(12 * 60);
    expect(formatBrasiliaClock(noonUtc, 'pt-BR')).toBe('12:00');
    expect(formatBrasiliaClock(new Date('2026-12-25T02:05:00Z'), 'en')).toBe('23:05');
  });
});

describe('ambient tint (day/night)', () => {
  it('CA-74: phases follow the guide (05:30 / 08:00 / 17:00 / 19:00)', () => {
    expect(dayPhase(5 * 60 + 29)).toBe('night');
    expect(dayPhase(5 * 60 + 30)).toBe('dawn');
    expect(dayPhase(8 * 60)).toBe('day');
    expect(dayPhase(17 * 60)).toBe('dusk');
    expect(dayPhase(19 * 60)).toBe('night');
    expect(dayPhase(0)).toBe('night');
  });

  it('CA-74: noon has no overlay, midnight has the night overlay', () => {
    expect(ambientTint(12 * 60).a).toBe(0);
    const night = ambientTint(0);
    expect(night).toEqual({ r: 30, g: 42, b: 94, a: 0.42 });
  });

  it('CA-74: boundaries blend linearly over 30 minutes', () => {
    const before = ambientTint(19 * 60 - 20); // fully dusk
    const mid = ambientTint(19 * 60); // half dusk / half night
    const after = ambientTint(19 * 60 + 20); // fully night
    expect(before.a).toBeCloseTo(0.22, 6);
    expect(after.a).toBeCloseTo(0.42, 6);
    expect(mid.a).toBeCloseTo(0.32, 6);
    expect(ambientTint(8 * 60 - 15).a).toBeCloseTo(0.18, 6);
    expect(ambientTint(8 * 60).a).toBeCloseTo(0.09, 6);
  });
});
