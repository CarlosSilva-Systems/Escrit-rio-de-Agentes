import { describe, expect, it } from 'vitest';
import { parseOfficeParams } from './params';

describe('developer URL parameters', () => {
  it('CA-80: defaults are all off', () => {
    expect(parseOfficeParams('')).toEqual({
      debug: false,
      demo: 0,
      seed: 1,
      rain: false,
      dirty: true,
    });
  });

  it('CA-80: reads debug, demo, zoom, time, rain and quality', () => {
    const p = parseOfficeParams(
      '?debug&demo=20&zoom=3&rain=1&quality=low&seed=7&debugTime=2026-12-24T21:00:00-03:00',
    );
    expect(p.debug).toBe(true);
    expect(p.demo).toBe(20);
    expect(p.zoom).toBe(3);
    expect(p.rain).toBe(true);
    expect(p.quality).toBe('low');
    expect(p.seed).toBe(7);
    expect(p.debugTime?.toISOString()).toBe('2026-12-25T00:00:00.000Z');
  });

  it('CA-80: ignores invalid values and caps the demo size', () => {
    const p = parseOfficeParams('?zoom=9&demo=100000&debugTime=banana&quality=ultra&debug=0');
    expect(p.zoom).toBeUndefined();
    expect(p.demo).toBe(64);
    expect(p.debugTime).toBeUndefined();
    expect(p.quality).toBeUndefined();
    expect(p.debug).toBe(false);
  });
});
