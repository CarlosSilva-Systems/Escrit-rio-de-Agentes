import { describe, expect, it } from 'vitest';
import { buildProvisionalMap } from '../../shared/world/provisionalMap';
import { fixedZoneLevels, toMultiplyColor } from './lighting';

describe('fixed room lighting', () => {
  const map = buildProvisionalMap();

  it('CA-43: the 4 free project rooms start dark, the server room is dim, the rest is lit', () => {
    const levels = fixedZoneLevels(map.lightZones);
    for (let n = 1; n <= 4; n++) expect(levels.get(`ZL-PRJ${n}`)).toBe('off');
    expect(levels.get('ZL-SRV')).toBe('dim');
    expect(levels.get('ZL-DIR')).toBe('lit');
    expect(levels.get('ZL-QUA')).toBe('lit');
  });

  it('CA-74: multiply colour equals a normal overlay of the tint over white', () => {
    expect(toMultiplyColor({ r: 30, g: 42, b: 94, a: 0 })).toBe('rgb(255, 255, 255)');
    expect(toMultiplyColor({ r: 0, g: 0, b: 0, a: 0.5 })).toBe('rgb(128, 128, 128)');
    expect(toMultiplyColor({ r: 30, g: 42, b: 94, a: 0.42 })).toBe('rgb(161, 166, 187)');
  });
});
