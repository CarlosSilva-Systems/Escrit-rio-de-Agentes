// Mouse picking of NPC sprites (T-25). Pure: works on plain data so it is testable without a canvas.

export interface Pickable {
  id: string;
  /** Sprite hit box in world pixels. */
  box: { x: number; y: number; w: number; h: number };
  /** Draw order key; the sprite drawn last (highest) wins when boxes overlap. */
  sortY: number;
}

/** Topmost sprite under the world point, or null. Ties go to the later entry (drawn last). */
export function pickSprite(sprites: readonly Pickable[], wx: number, wy: number): string | null {
  let best: Pickable | null = null;
  for (const s of sprites) {
    const { x, y, w, h } = s.box;
    if (wx < x || wy < y || wx >= x + w || wy >= y + h) continue;
    if (!best || s.sortY >= best.sortY) best = s;
  }
  return best ? best.id : null;
}

/** Hit box of a 16x32 character standing/sitting on the tile whose top-left is `(x, y)`. */
export function characterBox(x: number, y: number): Pickable['box'] {
  // Body only (not the empty margins of the cell): 12 px wide, from head top to the feet.
  return { x: Math.round(x) + 2, y: Math.round(y) - 14, w: 12, h: 30 };
}
