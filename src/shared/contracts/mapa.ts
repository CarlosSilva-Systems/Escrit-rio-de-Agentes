import { z } from 'zod';
import { mapId } from './escritorio';

// `assets/map/mapa.json` (schema `mapa/v1`, ARQUITETURA §7.1, ADR-0008). Ids come from the
// designer's MAPA.md and are kept unchanged. Rectangles are INCLUSIVE `[x1, y1, x2, y2]`.
// Walkability/reachability (BFS from DR-ENTRADA) and "all CA-11 rooms present" are checked by
// the map validation task (T-22), not here.

const tile = z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()]);
const rect = z.tuple([
  z.number().int().nonnegative(),
  z.number().int().nonnegative(),
  z.number().int().nonnegative(),
  z.number().int().nonnegative(),
]);
const facing = z.enum(['north', 'south', 'east', 'west']);
const slug = z.string().min(1).max(64);

export const POI_KINDS = [
  'coffee',
  'water',
  'fridge',
  'snacks',
  'copa-table',
  'sofa',
  'tv',
  'arcade',
  'pingpong',
  'window',
  'terrace',
  'hammock',
  'bathroom-door',
  'director-door-wait',
  'meeting-seat',
  'reception-wait',
] as const;

const TilesetSchema = z.strictObject({
  id: slug,
  image: z.string().min(1).max(200),
  columns: z.number().int().positive(),
  license: z.string().max(200),
});

const RoomSchema = z.strictObject({
  id: mapId,
  kind: z.string().min(1).max(32),
  department: z.string().max(48).optional(),
  nameKey: z.string().min(1).max(64),
  rects: z.array(rect).min(1),
  faceRows: z.number().int().nonnegative().optional(),
  doors: z.array(mapId),
  lightZone: mapId.optional(),
  camera: tile.optional(),
});

const DoorSchema = z.strictObject({
  id: mapId,
  tiles: z.array(tile).min(1),
  connects: z.array(mapId).length(2),
});

const DeskSchema = z.strictObject({
  id: mapId,
  room: mapId,
  department: z.string().max(48).optional(),
  seat: tile,
  facing,
  table: rect.optional(),
  vacancy: z.boolean().optional(),
  decor: z.array(slug).optional(),
});

const SeatSchema = z.strictObject({
  id: mapId,
  room: mapId,
  tile,
  facing,
  kind: z.enum(['meeting', 'project', 'sofa', 'provisional', 'visitor']),
});

const PoiSchema = z.strictObject({
  id: mapId,
  kind: z.enum(POI_KINDS),
  room: mapId,
  tiles: z.array(tile).min(1),
  facing: facing.optional(),
  capacity: z.number().int().positive(),
  activity: z.string().min(1).max(32),
  durationSec: z.tuple([z.number().positive(), z.number().positive()]),
});

const ObjectSchema = z.strictObject({
  id: slug,
  sprite: z.string().min(1).max(100),
  tile,
  footprint: z.tuple([z.number().int().positive(), z.number().int().positive()]),
  anim: z.string().max(32).nullable().optional(),
  light: z.string().max(64).nullable().optional(),
});

const LightZoneSchema = z.strictObject({
  id: mapId,
  rooms: z.array(mapId).min(1),
  mode: z.enum(['activity', 'night', 'always']),
});

const LightSchema = z.strictObject({
  id: slug,
  zone: mapId,
  tile,
  sprite: z.string().min(1).max(100),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

const WindowSchema = z.strictObject({
  id: mapId,
  room: mapId,
  rect,
  view: z.enum(['city', 'garden', 'sky']),
});

const BoardSchema = z.strictObject({
  id: slug,
  kind: z.enum(['metas', 'bugs', 'git-branches', 'tv-kanban', 'active-projects']),
  room: mapId.optional(),
  rect: rect.optional(),
});

const ProjectSlotSchema = z.strictObject({
  slot: z.number().int().min(0).max(3),
  room: mapId,
  doorSign: rect,
  board: rect,
  progressBar: rect,
  seats: z.array(mapId).min(1).max(6),
});

const SpawnSchema = z.strictObject({
  entrance: mapId,
  receptionCounter: tile,
  /** FILA-1…FILA-8; excess waits at the desk with "!". */
  approvalQueue: z.array(mapId).min(1).max(8),
  provisionalDesks: z.array(mapId),
  freelancerSofa: z.array(mapId),
});

const PetsSchema = z.strictObject({
  beds: z.record(z.string(), tile),
  forbiddenRooms: z.array(mapId),
});

const MapObjectSchema = z.strictObject({
  schema: z.literal('mapa/v1'),
  tileSize: z.number().int().positive(),
  cols: z.number().int().positive().max(256),
  rows: z.number().int().positive().max(256),
  tilesets: z.array(TilesetSchema),
  layers: z.strictObject({
    floor: z.array(z.number().int()),
    walls: z.array(z.number().int()),
    decorBelow: z.array(z.number().int()),
    decorAbove: z.array(z.number().int()),
  }),
  /** Base64 bitset of cols*rows bits (1 = blocked). */
  collision: z.string().regex(/^[A-Za-z0-9+/]*={0,2}$/),
  rooms: z.array(RoomSchema).min(1),
  doors: z.array(DoorSchema),
  desks: z.array(DeskSchema),
  seats: z.array(SeatSchema),
  pois: z.array(PoiSchema),
  objects: z.array(ObjectSchema),
  lightZones: z.array(LightZoneSchema),
  lights: z.array(LightSchema),
  windows: z.array(WindowSchema),
  boards: z.array(BoardSchema),
  projectSlots: z.array(ProjectSlotSchema).length(4),
  spawn: SpawnSchema,
  pets: PetsSchema,
});

/** Decoded size of a padded base64 string, without Buffer (this module also runs in the browser). */
function base64ByteLength(b64: string): number {
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - padding;
}

function findDuplicates(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const id of ids) (seen.has(id) ? dup : seen).add(id);
  return [...dup];
}

export const MapaSchema = MapObjectSchema.superRefine((map, ctx) => {
  const issue = (path: (string | number)[], message: string) =>
    ctx.addIssue({ code: 'custom', path, message });
  const cells = map.cols * map.rows;

  for (const layer of ['floor', 'walls', 'decorBelow', 'decorAbove'] as const) {
    if (map.layers[layer].length !== cells)
      issue(['layers', layer], `must have cols*rows = ${cells} entries`);
  }

  const expectedBytes = Math.ceil(cells / 8);
  const actualBytes = base64ByteLength(map.collision);
  if (actualBytes !== expectedBytes)
    issue(['collision'], `must decode to ${expectedBytes} bytes (cols*rows bits)`);

  const inBounds = (x: number, y: number) => x < map.cols && y < map.rows;
  const checkRect = (path: (string | number)[], r: readonly number[]) => {
    const [x1, y1, x2, y2] = r as [number, number, number, number];
    if (x1 > x2 || y1 > y2) issue(path, 'rect must satisfy x1<=x2 and y1<=y2');
    else if (!inBounds(x2, y2)) issue(path, 'rect is outside the map');
  };
  const checkTile = (path: (string | number)[], t: readonly number[]) => {
    const [x, y] = t as [number, number];
    if (!inBounds(x, y)) issue(path, 'tile is outside the map');
  };

  map.rooms.forEach((r, i) => r.rects.forEach((rc, j) => checkRect(['rooms', i, 'rects', j], rc)));
  map.doors.forEach((d, i) => d.tiles.forEach((t, j) => checkTile(['doors', i, 'tiles', j], t)));
  map.desks.forEach((d, i) => checkTile(['desks', i, 'seat'], d.seat));
  map.seats.forEach((s, i) => checkTile(['seats', i, 'tile'], s.tile));
  map.pois.forEach((p, i) => p.tiles.forEach((t, j) => checkTile(['pois', i, 'tiles', j], t)));
  map.windows.forEach((w, i) => checkRect(['windows', i, 'rect'], w.rect));

  const unique = (name: string, ids: string[]) => {
    for (const d of findDuplicates(ids)) issue([name], `duplicate id "${d}"`);
  };
  unique(
    'rooms',
    map.rooms.map((r) => r.id),
  );
  unique(
    'doors',
    map.doors.map((d) => d.id),
  );
  // Desks and seats share the id space: escritorio.json refers to a desk by id.
  unique('desks', [...map.desks.map((d) => d.id), ...map.seats.map((s) => s.id)]);
  unique(
    'pois',
    map.pois.map((p) => p.id),
  );

  const roomIds = new Set(map.rooms.map((r) => r.id));
  const requireRoom = (path: (string | number)[], id: string) => {
    if (!roomIds.has(id)) issue(path, `unknown room "${id}"`);
  };
  map.desks.forEach((d, i) => requireRoom(['desks', i, 'room'], d.room));
  map.seats.forEach((s, i) => requireRoom(['seats', i, 'room'], s.room));
  map.pois.forEach((p, i) => requireRoom(['pois', i, 'room'], p.room));
  map.projectSlots.forEach((p, i) => requireRoom(['projectSlots', i, 'room'], p.room));

  const slots = map.projectSlots.map((p) => p.slot).sort((a, b) => a - b);
  if (slots.join(',') !== '0,1,2,3') issue(['projectSlots'], 'slots must be exactly 0, 1, 2, 3');
});
export type Mapa = z.infer<typeof MapaSchema>;
