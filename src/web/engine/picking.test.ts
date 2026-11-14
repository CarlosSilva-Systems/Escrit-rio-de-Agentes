import { describe, expect, it } from 'vitest';
import { characterBox, pickSprite, type Pickable } from './picking';

const npc = (id: string, x: number, y: number): Pickable => ({
  id,
  box: characterBox(x, y),
  sortY: y + 16,
});

describe('pickSprite', () => {
  it('CA-14: returns the NPC under the point and null on empty floor', () => {
    const sprites = [npc('lívia', 160, 160), npc('bruno', 320, 160)];
    expect(pickSprite(sprites, 168, 150)).toBe('lívia');
    expect(pickSprite(sprites, 328, 170)).toBe('bruno');
    expect(pickSprite(sprites, 240, 160)).toBeNull();
  });

  it('CA-14: the sprite in front (higher sortY) wins where two overlap', () => {
    const back = npc('back', 160, 160);
    const front = npc('front', 164, 168);
    expect(pickSprite([back, front], 168, 175)).toBe('front');
    expect(pickSprite([front, back], 168, 175)).toBe('front');
  });

  it('CA-14: box edges are half-open (no double hit between neighbours)', () => {
    const a = { id: 'a', box: { x: 0, y: 0, w: 10, h: 10 }, sortY: 1 };
    const b = { id: 'b', box: { x: 10, y: 0, w: 10, h: 10 }, sortY: 1 };
    expect(pickSprite([a, b], 10, 5)).toBe('b');
    expect(pickSprite([a, b], 9, 5)).toBe('a');
  });
});
