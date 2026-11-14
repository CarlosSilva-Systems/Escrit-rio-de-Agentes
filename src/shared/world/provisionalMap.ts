// Provisional floor plan: MAPA.md (Bianca, 2026-11-12) transcribed to a mapa/v1 document so the
// engine, the demo walkers and the tests can run before `assets/map/mapa.json` exists. Ids,
// coordinates and rects are copied from MAPA.md unchanged (inclusive `[x1, y1, x2, y2]`).
// When the real file loads, this module is only the fallback (see engine/world/loadWorld.ts).

import type { Mapa } from '../contracts/mapa';
import { deriveCollision, deriveLayers } from './layers';
import { encodeCollision } from './grid';
import { PROCEDURAL_TILESET_IMAGE } from './tileIds';

type Rect = [number, number, number, number];
type Tile = [number, number];
type Facing = 'north' | 'south' | 'east' | 'west';
type Room = Mapa['rooms'][number];
type Desk = Mapa['desks'][number];
type Seat = Mapa['seats'][number];
type Poi = Mapa['pois'][number];
type MapObject = Mapa['objects'][number];

const COLS = 64;
const ROWS = 52;

// --- Rooms (MAPA.md §2) ---------------------------------------------------------------------

const room = (
  id: string,
  kind: string,
  rect: Rect,
  doors: string[],
  extra: Partial<Room> = {},
): Room => ({ id, kind, nameKey: `room.${id}`, rects: [rect], doors, faceRows: 2, ...extra });

const projectRoom = (n: number, a: number): Room =>
  room(`PRJ${n}`, 'projeto', [a, 29, a + 6, 37], [`DR-PRJ${n}`], {
    lightZone: `ZL-PRJ${n}`,
    camera: [a + 3, 33],
  });

const rooms: Room[] = [
  room('DIR', 'diretoria', [1, 1, 17, 10], ['DR-DIR'], {
    department: 'diretoria',
    lightZone: 'ZL-DIR',
    camera: [9, 6],
  }),
  room('REU', 'reuniao', [19, 1, 40, 10], ['DR-REU'], { lightZone: 'ZL-REU', camera: [29, 6] }),
  room('PLN', 'planejamento', [42, 1, 62, 10], ['DR-PLN'], {
    department: 'planejamento',
    lightZone: 'ZL-PLN',
    camera: [52, 6],
  }),
  room('ENG', 'engenharia', [1, 14, 26, 23], ['DR-ENG-N', 'DR-ENG-S'], {
    department: 'engenharia',
    lightZone: 'ZL-ENG',
    camera: [13, 19],
  }),
  room('QUA', 'qualidade', [28, 14, 42, 23], ['DR-QUA-N', 'DR-QUA-S'], {
    department: 'qualidade',
    lightZone: 'ZL-QUA',
    camera: [35, 19],
  }),
  room('SOC', 'soc', [47, 14, 62, 23], ['DR-SOC'], {
    department: 'qualidade',
    lightZone: 'ZL-SOC',
    camera: [54, 19],
  }),
  projectRoom(1, 1),
  projectRoom(2, 9),
  projectRoom(3, 17),
  projectRoom(4, 25),
  room('ENT', 'entrega', [36, 29, 46, 37], ['DR-ENT'], {
    department: 'entrega',
    lightZone: 'ZL-ENT',
    camera: [41, 33],
  }),
  room('SRV', 'servidores', [48, 29, 53, 37], ['DR-SRV'], {
    lightZone: 'ZL-SRV',
    camera: [50, 33],
  }),
  room('BIB', 'biblioteca', [55, 29, 62, 37], ['DR-BIB'], {
    department: 'biblioteca',
    lightZone: 'ZL-BIB',
    camera: [58, 33],
  }),
  room('REC', 'recepcao', [1, 41, 16, 50], ['DR-REC-N', 'DR-ENTRADA'], {
    lightZone: 'ZL-REC',
    camera: [8, 46],
  }),
  room('WC', 'banheiros', [18, 41, 23, 50], ['DR-WC1', 'DR-WC2'], {
    lightZone: 'ZL-WC',
    camera: [20, 46],
  }),
  room('COP', 'copa', [25, 41, 53, 50], ['DR-COP', 'DR-TER'], {
    lightZone: 'ZL-COP',
    camera: [39, 46],
  }),
  room('TER', 'terraco', [55, 41, 62, 50], ['DR-TER'], { lightZone: 'ZL-TER', camera: [58, 46] }),
  room('COR1', 'corredor', [1, 12, 62, 13], [], { faceRows: 0, lightZone: 'ZL-COR1' }),
  room('COR2', 'corredor', [1, 25, 62, 28], [], {
    faceRows: 0,
    lightZone: 'ZL-COR2',
    camera: [31, 26],
  }),
  room('COR3', 'corredor', [1, 39, 62, 40], [], { faceRows: 0, lightZone: 'ZL-COR3' }),
  room('PAS1', 'passagem', [44, 14, 45, 24], [], { faceRows: 0, lightZone: 'ZL-COR1' }),
  room('PAS2', 'passagem', [33, 29, 34, 38], [], { faceRows: 0, lightZone: 'ZL-COR2' }),
];

// --- Doors (MAPA.md §3) ---------------------------------------------------------------------

const door = (id: string, a: string, b: string, ...tiles: Tile[]): Mapa['doors'][number] => ({
  id,
  tiles,
  connects: [a, b],
});
/** 2-wide door `[x, x+1]` crossing `[y1..y2]`. */
const wide = (x: number, y1: number, y2 = y1): Tile[] => {
  const out: Tile[] = [];
  for (let y = y1; y <= y2; y++) out.push([x, y], [x + 1, y]);
  return out;
};

const doors: Mapa['doors'] = [
  door('DR-DIR', 'DIR', 'COR1', ...wide(8, 11)),
  door('DR-REU', 'REU', 'COR1', ...wide(29, 11)),
  door('DR-PLN', 'PLN', 'COR1', ...wide(50, 11)),
  door('DR-ENG-N', 'ENG', 'COR1', ...wide(13, 14, 15)),
  door('DR-ENG-S', 'ENG', 'COR2', ...wide(13, 24)),
  door('DR-QUA-N', 'QUA', 'COR1', ...wide(33, 14, 15)),
  door('DR-QUA-S', 'QUA', 'COR2', ...wide(33, 24)),
  door('DR-SOC', 'SOC', 'COR2', ...wide(52, 24)),
  door('DR-PRJ1', 'PRJ1', 'COR2', ...wide(2, 29, 30)),
  door('DR-PRJ2', 'PRJ2', 'COR2', ...wide(10, 29, 30)),
  door('DR-PRJ3', 'PRJ3', 'COR2', ...wide(18, 29, 30)),
  door('DR-PRJ4', 'PRJ4', 'COR2', ...wide(26, 29, 30)),
  door('DR-ENT', 'ENT', 'COR2', ...wide(38, 29, 30)),
  door('DR-SRV', 'SRV', 'COR2', ...wide(48, 29, 30)),
  door('DR-BIB', 'BIB', 'COR2', ...wide(56, 29, 30)),
  door('DR-REC-N', 'REC', 'COR3', ...wide(2, 41, 42)),
  door('DR-ENTRADA', 'REC', 'REC', ...wide(8, 51)),
  door('DR-WC1', 'WC', 'COR3', [19, 41], [19, 42]),
  door('DR-WC2', 'WC', 'COR3', [22, 41], [22, 42]),
  door('DR-COP', 'COP', 'COR3', ...wide(38, 41, 42)),
  door('DR-TER', 'COP', 'TER', [54, 47], [54, 48]),
];

// --- Desks and seats (MAPA.md §6) -------------------------------------------------------------

const desk = (
  id: string,
  roomId: string,
  department: string | undefined,
  seat: Tile,
  table: Rect | undefined,
  options: { facing?: Facing; vacancy?: boolean; decor?: string[] } = {},
): Desk => ({
  id,
  room: roomId,
  ...(department ? { department } : {}),
  seat,
  facing: options.facing ?? 'south',
  ...(table ? { table } : {}),
  ...(options.vacancy ? { vacancy: true } : {}),
  ...(options.decor ? { decor: options.decor } : {}),
});

const desks: Desk[] = [
  desk('DIR-00', 'DIR', 'diretoria', [9, 4], [7, 5, 11, 6], { decor: ['nameplate'] }),
  desk('PLN-01', 'PLN', 'planejamento', [45, 5], [44, 6, 46, 7], { decor: ['postits'] }),
  desk('PLN-02', 'PLN', 'planejamento', [51, 5], [50, 6, 52, 7], { decor: ['blueprints'] }),
  desk('PLN-03', 'PLN', 'planejamento', [57, 5], [56, 6, 58, 7], { decor: ['tablet'] }),
  desk('PLN-V1', 'PLN', 'planejamento', [61, 5], [60, 6, 62, 7], { vacancy: true }),
  desk('ENG-01', 'ENG', 'engenharia', [3, 17], [2, 18, 4, 19], { decor: ['dual-monitors'] }),
  desk('ENG-02', 'ENG', 'engenharia', [7, 17], [6, 18, 8, 19], {
    decor: ['dual-monitors', 'duck'],
  }),
  desk('ENG-03', 'ENG', 'engenharia', [11, 17], [10, 18, 12, 19], { decor: ['mug'] }),
  desk('ENG-04', 'ENG', 'engenharia', [17, 17], [15, 18, 19, 19], { decor: ['soldering'] }),
  desk('ENG-05', 'ENG', 'engenharia', [23, 17], [22, 18, 24, 19], { decor: ['plc'] }),
  desk('ENG-V1', 'ENG', 'engenharia', [3, 21], [2, 22, 4, 23], { vacancy: true }),
  desk('ENG-V2', 'ENG', 'engenharia', [7, 21], [6, 22, 8, 23], { vacancy: true }),
  desk('ENG-V3', 'ENG', 'engenharia', [11, 21], [10, 22, 12, 23], { vacancy: true }),
  desk('QUA-01', 'QUA', 'qualidade', [31, 17], [30, 18, 32, 19], { decor: ['magnifier'] }),
  desk('QUA-02', 'QUA', 'qualidade', [36, 17], [35, 18, 37, 19], { decor: ['pull-requests'] }),
  desk('QUA-V1', 'QUA', 'qualidade', [31, 21], [30, 22, 32, 23], { vacancy: true }),
  desk('QUA-V2', 'QUA', 'qualidade', [36, 21], [35, 22, 37, 23], { vacancy: true }),
  desk('SOC-01', 'SOC', 'qualidade', [50, 17], [49, 18, 51, 19], { decor: ['dual-monitors'] }),
  desk('SOC-02', 'SOC', 'qualidade', [55, 17], [54, 18, 56, 19], { decor: ['stickers'] }),
  desk('SOC-V1', 'SOC', 'qualidade', [60, 17], [59, 18, 61, 19], { vacancy: true }),
  desk('ENT-01', 'ENT', 'entrega', [37, 32], [36, 33, 38, 34], { decor: ['git'] }),
  desk('ENT-02', 'ENT', 'entrega', [41, 32], [40, 33, 42, 34], { decor: ['typewriter'] }),
  desk('ENT-V1', 'ENT', 'entrega', [45, 32], [44, 33, 46, 34], { vacancy: true }),
  desk('BIB-01', 'BIB', 'biblioteca', [59, 33], [58, 34, 60, 35], { decor: ['books', 'lamp'] }),
  desk('BIB-V1', 'BIB', 'biblioteca', [57, 36], undefined, { facing: 'east', vacancy: true }),
  desk('FL-D1', 'REC', undefined, [2, 45], [1, 46, 3, 47], { decor: ['visitor-badge'] }),
  desk('FL-D2', 'REC', undefined, [14, 45], [13, 46, 15, 47], { decor: ['visitor-badge'] }),
];

const seat = (
  id: string,
  roomId: string,
  tile: Tile,
  facing: Facing,
  kind: Seat['kind'],
): Seat => ({
  id,
  room: roomId,
  tile,
  facing,
  kind,
});

const pad = (n: number) => String(n).padStart(2, '0');
const meetingSeats: Seat[] = [];
for (let i = 0; i < 6; i++) {
  meetingSeats.push(seat(`REU-${pad(i + 1)}`, 'REU', [24 + i * 2, 5], 'south', 'meeting'));
  meetingSeats.push(seat(`REU-${pad(i + 7)}`, 'REU', [24 + i * 2, 8], 'north', 'meeting'));
}
meetingSeats.push(seat('REU-13', 'REU', [22, 6], 'east', 'meeting'));
meetingSeats.push(seat('REU-14', 'REU', [37, 6], 'west', 'meeting'));

const projectSeats: Seat[] = [];
for (let n = 1; n <= 4; n++) {
  const a = 1 + (n - 1) * 8;
  const spots: [Tile, Facing][] = [
    [[a + 2, 33], 'south'],
    [[a + 3, 33], 'south'],
    [[a + 4, 33], 'south'],
    [[a + 2, 36], 'north'],
    [[a + 3, 36], 'north'],
    [[a + 4, 36], 'north'],
  ];
  spots.forEach(([tile, facing], i) =>
    projectSeats.push(seat(`PRJ${n}-${i + 1}`, `PRJ${n}`, tile, facing, 'project')),
  );
}

const seats: Seat[] = [
  seat('DIR-V1', 'DIR', [8, 8], 'north', 'visitor'),
  seat('DIR-V2', 'DIR', [10, 8], 'north', 'visitor'),
  ...meetingSeats,
  ...projectSeats,
  seat('FL-S1', 'REC', [13, 49], 'north', 'sofa'),
  seat('FL-S2', 'REC', [14, 49], 'north', 'sofa'),
];

// --- Points of interest (MAPA.md §4 and §8) ---------------------------------------------------

const poi = (
  id: string,
  kind: Poi['kind'],
  roomId: string,
  tiles: Tile[],
  capacity: number,
  activity: string,
  durationSec: [number, number],
  facing?: Facing,
): Poi => ({
  id,
  kind,
  room: roomId,
  tiles,
  capacity,
  activity,
  durationSec,
  ...(facing ? { facing } : {}),
});

const queue: Poi[] = Array.from({ length: 8 }, (_, i) =>
  poi(
    `FILA-${i + 1}`,
    'director-door-wait',
    'COR1',
    [[9 + i, 12]],
    1,
    'wait-approval',
    [1, 600],
    'west',
  ),
);

const pois: Poi[] = [
  poi(
    'POI-CAFE',
    'coffee',
    'COP',
    [
      [29, 44],
      [30, 44],
    ],
    2,
    'coffee',
    [20, 90],
    'north',
  ),
  poi('POI-BEB', 'water', 'COR2', [[36, 26]], 1, 'water', [10, 30]),
  poi(
    'POI-FLIP',
    'arcade',
    'COP',
    [
      [48, 45],
      [51, 45],
    ],
    2,
    'arcade',
    [30, 180],
    'north',
  ),
  poi(
    'POI-PING',
    'pingpong',
    'COP',
    [
      [46, 47],
      [52, 48],
    ],
    2,
    'pingpong',
    [30, 120],
  ),
  poi(
    'POI-JAN',
    'window',
    'COP',
    [
      [53, 45],
      [53, 49],
      [37, 3],
      [4, 3],
      [59, 31],
    ],
    5,
    'window',
    [15, 60],
    'north',
  ),
  poi(
    'POI-TER',
    'terrace',
    'TER',
    [
      [57, 47],
      [59, 47],
      [61, 47],
      [59, 44],
      [60, 42],
    ],
    5,
    'terrace',
    [30, 180],
  ),
  poi(
    'POI-COPA',
    'copa-table',
    'COP',
    [
      [32, 45],
      [36, 45],
      [32, 49],
      [36, 49],
      [42, 46],
      [43, 46],
      [44, 46],
    ],
    7,
    'chat',
    [20, 120],
  ),
  poi('POI-WC1', 'bathroom-door', 'WC', [[19, 42]], 1, 'bathroom', [20, 60]),
  poi('POI-WC2', 'bathroom-door', 'WC', [[22, 42]], 1, 'bathroom', [20, 60]),
  poi(
    'POI-SOFA-REC',
    'reception-wait',
    'REC',
    [
      [13, 49],
      [14, 49],
    ],
    2,
    'wait',
    [30, 300],
    'north',
  ),
  poi(
    'POI-TV',
    'tv',
    'COP',
    [
      [42, 46],
      [43, 46],
      [44, 46],
    ],
    3,
    'watch-tv',
    [30, 180],
    'north',
  ),
  poi(
    'POI-MASC',
    'sofa',
    'COP',
    [
      [27, 49],
      [29, 49],
    ],
    2,
    'pet-bed',
    [60, 600],
  ),
  ...queue,
];

// --- Objects (MAPA.md §5, §7, §10) ------------------------------------------------------------

const objects: MapObject[] = [];
let objectCounter = 0;
/** Places `sprite` over the inclusive rect `[x1, y1, x2, y2]`. */
const obj = (
  sprite: string,
  x1: number,
  y1: number,
  x2 = x1,
  y2 = y1,
  extra: Partial<MapObject> = {},
) => {
  objects.push({
    id: `${sprite.replace('/', '-')}-${++objectCounter}`,
    sprite,
    tile: [x1, y1],
    footprint: [x2 - x1 + 1, y2 - y1 + 1],
    ...extra,
  });
};

// Rugs (department colours / project colours)
obj('rug/diretoria', 5, 4, 13, 9);
obj('rug/planejamento', 43, 4, 61, 8);
obj('rug/engenharia', 1, 16, 13, 23);
obj('rug/qualidade', 29, 16, 41, 23);
obj('rug/entrega', 37, 31, 46, 36);
obj('rug/biblioteca', 56, 31, 61, 37);
obj('rug/recepcao', 4, 43, 11, 44);
for (let n = 1; n <= 4; n++) obj(`rug/projeto${n}`, 2 + (n - 1) * 8, 31, 6 + (n - 1) * 8, 36);

// Wall-face decoration
obj('face/logo', 6, 41, 11, 42);
obj('face/board-projects', 12, 41, 15, 42);
obj('face/shelf', 1, 1, 4, 2);
obj('face/tv', 26, 1, 33, 2);
obj('face/whiteboard', 20, 1, 24, 2);
obj('face/postits', 43, 1, 47, 2);
obj('face/diagram', 49, 1, 53, 2);
obj('face/palette', 55, 1, 59, 2);
obj('face/electric', 21, 14, 25, 15);
obj('face/screens', 47, 14, 56, 15);
obj('face/lock', 58, 14, 61, 15);
obj('face/shelf', 36, 29, 37, 30);
obj('face/rack', 50, 29, 53, 30);
obj('face/shelf', 58, 29, 62, 30);
obj('face/fridge', 26, 41, 27, 42);
obj('face/vending', 33, 41, 34, 42);
obj('face/tv', 41, 41, 45, 42);
obj('face/lights-terrace', 55, 41, 62, 41);

// Desks, chairs and monitors
const chairFacing: Record<Facing, string> = {
  south: 'furn/chair-s',
  north: 'furn/chair-n',
  east: 'furn/chair-e',
  west: 'furn/chair-w',
};
for (const d of desks) {
  if (d.table) {
    const [x1, y1, x2, y2] = d.table;
    const sprite = d.vacancy
      ? 'furn/desk-empty'
      : d.decor?.includes('dual-monitors')
        ? 'furn/desk-dual'
        : 'furn/desk';
    obj(sprite, x1, y1, x2, y2, { anim: d.decor?.[0] ?? null });
  }
  obj(chairFacing[d.facing], d.seat[0], d.seat[1]);
}
for (const s of seats) obj(chairFacing[s.facing], s.tile[0], s.tile[1]);
obj('furn/table-long', 23, 6, 36, 7);
for (let n = 1; n <= 4; n++) obj('furn/desk-large', 3 + (n - 1) * 8, 34, 5 + (n - 1) * 8, 35);
obj('furn/table', 53, 9, 55, 10);

// Furniture by room
obj('furn/trophy', 16, 4);
obj('furn/lamp', 15, 6);
obj('furn/plant', 1, 9);
obj('furn/plant', 16, 9);
obj('furn/plant', 20, 9);
obj('furn/plant', 39, 9);
obj('flat/sofa', 44, 9, 47, 10);
obj('furn/shelf-small', 14, 16);
obj('furn/coat-rack', 26, 17);
obj('furn/plant', 1, 23);
obj('furn/plant', 26, 23);
obj('furn/shelf-small', 29, 16);
obj('furn/rack', 53, 32, 53, 33);
obj('furn/rack', 53, 35, 53, 36);
obj('furn/lamp', 61, 35);
obj('furn/globe', 57, 34);
obj('furn/ladder', 61, 31, 61, 32);
obj('furn/shelf-tall', 62, 33, 62, 37);
obj('furn/shelf-tall', 55, 33, 55, 37);
obj('furn/counter', 28, 43, 31, 43);
obj('furn/coffee-machine', 29, 43);
obj('furn/table', 42, 43, 44, 43);
obj('flat/sofa', 41, 45, 45, 46);
obj('furn/table-round', 33, 46, 35, 48);
obj('furn/arcade', 48, 43, 49, 44);
obj('furn/arcade', 51, 43, 52, 44);
obj('furn/pingpong', 47, 47, 51, 48);
obj('flat/pet-bed', 27, 49);
obj('flat/pet-bed', 29, 49);
obj('furn/counter', 5, 45, 10, 46);
obj('flat/sofa', 12, 49, 15, 50);
obj('furn/plant', 16, 43);
obj('flat/hammock', 57, 44, 61, 44);
obj('flat/pouf', 57, 47);
obj('flat/pouf', 59, 47);
obj('flat/pouf', 61, 47);
for (const [x, y] of [
  [62, 43],
  [62, 45],
  [62, 47],
  [62, 49],
  [60, 50],
  [58, 50],
  [56, 50],
] as Tile[])
  obj('furn/plant', x, y);
for (const [x, y] of [
  [25, 43],
  [53, 43],
  [25, 50],
  [1, 12],
  [62, 12],
  [2, 25],
  [14, 25],
  [26, 25],
  [41, 25],
  [48, 25],
  [60, 25],
  [1, 39],
  [31, 39],
  [62, 39],
] as Tile[])
  obj('furn/plant', x, y);
obj('furn/water-cooler', 36, 25);
obj('furn/noticeboard', 20, 25, 23, 25);
obj('furn/bench', 10, 27);
obj('furn/bench', 50, 27);
obj('furn/bench', 24, 40);

// Project-room fixtures
for (let n = 1; n <= 4; n++) {
  const a = 1 + (n - 1) * 8;
  obj('furn/lamp', a + 6, 31);
  obj('furn/plant', a, 31);
  obj('face/project-board', a + 3, 29, a + 6, 30);
}

// --- Windows, boards, lights, zones -----------------------------------------------------------

const win = (id: string, roomId: string, rect: Rect, view: 'city' | 'garden' | 'sky') => ({
  id,
  room: roomId,
  rect,
  view,
});
const windows: Mapa['windows'] = [
  win('W-01', 'DIR', [6, 1, 12, 2], 'city'),
  win('W-02', 'REU', [35, 1, 39, 2], 'sky'),
  win('W-03', 'PLN', [60, 1, 62, 2], 'sky'),
  win('W-04', 'ENG', [0, 16, 0, 19], 'garden'),
  win('W-05', 'BIB', [63, 31, 63, 32], 'garden'),
  win('W-06', 'REC', [3, 51, 6, 51], 'city'),
  win('W-07', 'COP', [54, 43, 54, 46], 'sky'),
  win('W-08', 'COP', [54, 49, 54, 50], 'sky'),
  win('W-09', 'REC', [11, 51, 14, 51], 'city'),
];

const boards: Mapa['boards'] = [
  { id: 'metas-do-mes', room: 'DIR', kind: 'metas', rect: [13, 1, 16, 2] },
  { id: 'tv-reuniao', room: 'REU', kind: 'tv-kanban', rect: [26, 1, 33, 2] },
  { id: 'bugs', room: 'QUA', kind: 'bugs', rect: [38, 14, 41, 15] },
  { id: 'branches', room: 'ENT', kind: 'git-branches', rect: [41, 29, 46, 30] },
  { id: 'recepcao-projetos', room: 'REC', kind: 'active-projects', rect: [12, 41, 15, 42] },
];

const lightZoneFor = (id: string, roomIds: string[], mode: 'activity' | 'night' | 'always') => ({
  id,
  rooms: roomIds,
  mode,
});
const lightZones: Mapa['lightZones'] = [
  lightZoneFor('ZL-DIR', ['DIR'], 'night'),
  lightZoneFor('ZL-REU', ['REU'], 'night'),
  lightZoneFor('ZL-PLN', ['PLN'], 'night'),
  lightZoneFor('ZL-ENG', ['ENG'], 'night'),
  lightZoneFor('ZL-QUA', ['QUA'], 'always'),
  lightZoneFor('ZL-SOC', ['SOC'], 'always'),
  lightZoneFor('ZL-PRJ1', ['PRJ1'], 'activity'),
  lightZoneFor('ZL-PRJ2', ['PRJ2'], 'activity'),
  lightZoneFor('ZL-PRJ3', ['PRJ3'], 'activity'),
  lightZoneFor('ZL-PRJ4', ['PRJ4'], 'activity'),
  lightZoneFor('ZL-ENT', ['ENT'], 'always'),
  lightZoneFor('ZL-SRV', ['SRV'], 'always'),
  lightZoneFor('ZL-BIB', ['BIB'], 'night'),
  lightZoneFor('ZL-REC', ['REC'], 'night'),
  lightZoneFor('ZL-WC', ['WC'], 'always'),
  lightZoneFor('ZL-COP', ['COP'], 'night'),
  lightZoneFor('ZL-TER', ['TER'], 'night'),
  lightZoneFor('ZL-COR1', ['COR1', 'PAS1'], 'always'),
  lightZoneFor('ZL-COR2', ['COR2', 'PAS2'], 'always'),
  lightZoneFor('ZL-COR3', ['COR3'], 'always'),
];

const lamps: [string, Tile[]][] = [
  [
    'ZL-DIR',
    [
      [4, 5],
      [15, 6],
      [9, 3],
    ],
  ],
  [
    'ZL-REU',
    [
      [25, 3],
      [31, 3],
      [37, 9],
    ],
  ],
  [
    'ZL-PLN',
    [
      [45, 4],
      [51, 4],
      [57, 4],
    ],
  ],
  [
    'ZL-ENG',
    [
      [4, 16],
      [12, 16],
      [20, 16],
    ],
  ],
  [
    'ZL-QUA',
    [
      [31, 16],
      [36, 16],
    ],
  ],
  [
    'ZL-ENT',
    [
      [40, 31],
      [45, 31],
    ],
  ],
  [
    'ZL-BIB',
    [
      [61, 35],
      [57, 34],
    ],
  ],
  [
    'ZL-REC',
    [
      [4, 44],
      [13, 44],
    ],
  ],
  [
    'ZL-COP',
    [
      [30, 43],
      [43, 43],
      [50, 45],
    ],
  ],
  ['ZL-PRJ1', [[7, 31]]],
  ['ZL-PRJ2', [[15, 31]]],
  ['ZL-PRJ3', [[23, 31]]],
  ['ZL-PRJ4', [[31, 31]]],
  [
    'ZL-TER',
    [
      [58, 43],
      [61, 43],
    ],
  ],
];
const lights: Mapa['lights'] = lamps.flatMap(([zone, tiles]) =>
  tiles.map((tile, i) => ({
    id: `lamp-${zone.slice(3).toLowerCase()}-${i + 1}`,
    zone,
    tile,
    sprite: 'light/warm-48',
    color: zone === 'ZL-QUA' ? '#cfe6ff' : '#ffd9a0',
  })),
);

// --- Project slots, spawn, pets ---------------------------------------------------------------

const projectSlots: Mapa['projectSlots'] = [0, 1, 2, 3].map((slot) => {
  const a = 1 + slot * 8;
  return {
    slot,
    room: `PRJ${slot + 1}`,
    doorSign: [a, 28, a + 6, 28],
    board: [a + 3, 29, a + 6, 30],
    progressBar: [a + 1, 29, a + 2, 29],
    seats: [1, 2, 3, 4, 5, 6].map((i) => `PRJ${slot + 1}-${i}`),
  };
});

export function buildProvisionalMap(): Mapa {
  const base: Mapa = {
    schema: 'mapa/v1',
    tileSize: 16,
    cols: COLS,
    rows: ROWS,
    tilesets: [
      {
        id: 'procedural',
        image: PROCEDURAL_TILESET_IMAGE,
        columns: 16,
        license: 'CREDITS#procedural',
      },
    ],
    layers: { floor: [], walls: [], decorBelow: [], decorAbove: [] },
    collision: '',
    rooms,
    doors,
    desks,
    seats,
    pois,
    objects,
    lightZones,
    lights,
    windows,
    boards,
    projectSlots,
    spawn: {
      entrance: 'DR-ENTRADA',
      receptionCounter: [8, 47],
      approvalQueue: queue.map((q) => q.id),
      provisionalDesks: ['FL-D1', 'FL-D2'],
      freelancerSofa: ['FL-S1', 'FL-S2'],
    },
    pets: {
      beds: { pacoca: [27, 49], biscoito: [29, 49] },
      forbiddenRooms: ['SOC', 'PRJ1', 'PRJ2', 'PRJ3', 'PRJ4'],
    },
  };
  return {
    ...base,
    layers: deriveLayers(base),
    collision: encodeCollision(deriveCollision(base)),
  };
}
