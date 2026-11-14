// Dynamic sprites (NPCs, pets...) as the renderer sees them.

import type { Anim, Dir } from './art/characters';
import { characterFrameName, type Atlas } from './atlas';
import { characterBox, type Pickable } from './picking';

export interface SpriteInstance {
  id: string;
  /** Atlas frame name, e.g. `npc-livia/walk/e/2`. */
  frameName: string;
  /** Mirror horizontally (W is the mirrored E). */
  flip: boolean;
  /** World pixel position of the TILE the sprite stands on (its top-left corner). May be fractional. */
  x: number;
  y: number;
  /** Optional draw-order override; default is the bottom of the tile. */
  sortY?: number;
}

export function characterSprite(
  id: string,
  spriteKey: string,
  anim: Anim,
  dir: Dir | 'w',
  frame: number,
  x: number,
  y: number,
  sortY?: number,
): SpriteInstance {
  const { name, flip } = characterFrameName(spriteKey, anim, dir, frame);
  return { id, frameName: name, flip, x, y, ...(sortY !== undefined ? { sortY } : {}) };
}

export function spriteSortY(s: SpriteInstance): number {
  return s.sortY ?? s.y + 16;
}

/** Pick data for the current sprites (characters only; other kinds can pass their own boxes). */
export function toPickables(sprites: readonly SpriteInstance[], atlas: Atlas): Pickable[] {
  const out: Pickable[] = [];
  for (const s of sprites) {
    if (!s.frameName.startsWith('npc-')) continue;
    const frame = atlas.frame(s.frameName);
    if (!frame) continue;
    out.push({ id: s.id, box: characterBox(s.x, s.y), sortY: spriteSortY(s) });
  }
  return out;
}
