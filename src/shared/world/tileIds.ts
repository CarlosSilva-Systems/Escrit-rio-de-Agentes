// Tile ids of the built-in (code-drawn) tileset. They are the ids that `deriveLayers` writes and
// that the procedural tile painter understands. A real tileset PNG (mapa.json -> tilesets[])
// replaces them without touching the engine.

export const TILE = {
  VOID: 0,
  FLOOR_A: 1,
  FLOOR_B: 2,
  FLOOR_C: 3,
  CORRIDOR_A: 4,
  CORRIDOR_B: 5,
  SOC: 6,
  TERRACE: 7,
  SERVER: 8,
  DOORWAY: 9,
  WALL_TOP: 16,
  FACE_UPPER: 17,
  FACE_LOWER: 18,
  GLASS: 19,
} as const;

/** Name of the built-in tileset in `mapa.json -> tilesets[].image`. */
export const PROCEDURAL_TILESET_IMAGE = 'procedural';
