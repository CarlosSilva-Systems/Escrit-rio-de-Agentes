// Builds assets/map/mapa.json (schema `mapa/v1`) from the ASCII plan in docs/design/MAPA.md.
// Run with: node scripts/build-map.mjs   (no dependencies; output is deterministic)
//
// Inputs : docs/design/MAPA.md  (section 1, the 64x52 character grid; coordinates are the source of truth)
// Output : assets/map/mapa.json (written atomically)
//
// Conventions chosen here (the contract leaves them open):
// - Rectangles are inclusive [x1, y1, x2, y2]. Object `tile` is the top-left corner, `footprint` is [w, h].
// - `collision` is a base64 bitset, LSB-first: bit (y * cols + x) lives in byte (i >> 3), mask 1 << (i & 7).
// - Layer ids are SEMANTIC PLACEHOLDERS (the tileset art is not chosen yet), not tileset indexes:
//     floor      = 1 + index of the owning room in `rooms` (0 = outside / wall)
//     walls      = 1 wall, 2 glass wall, 3 north "face" row of a room (blocked, decorated by art)
//     decorBelow = decorAbove = 0 (rugs, shelves, etc. are in `objects` until the art pass)
// - Blocked tiles: walls, glass, the face rows of every room, the interior of the bathrooms (not rendered),
//   desk tables and solid objects. Seats, POI tiles and doors stay walkable.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const COLS = 64;
const ROWS = 52;

// ---------------------------------------------------------------- plan (MAPA.md section 1)
const markdown = readFileSync(join(root, 'docs', 'design', 'MAPA.md'), 'utf8').replace(
  /\r\n/g,
  '\n',
);
const plan = [];
for (const line of markdown.split('\n')) {
  const m = /^(\d{2}) (.{64})$/.exec(line);
  if (m) plan[Number(m[1])] = m[2];
}
if (plan.length !== ROWS || plan.some((row) => typeof row !== 'string')) {
  throw new Error(`MAPA.md: expected ${ROWS} plan rows of ${COLS} characters, got ${plan.length}`);
}
const charAt = (x, y) => plan[y][x];

// ---------------------------------------------------------------- rooms (MAPA.md section 2)
const room = (id, kind, department, rects, face, camera, zone, letter) => ({
  id,
  kind,
  department,
  rects,
  face,
  camera,
  zone,
  letter,
});
const ROOMS = [
  room('DIR', 'diretoria', 'diretoria', [[1, 1, 17, 10]], 2, [9, 6], 'ZL-DIR', 'D'),
  room('REU', 'reuniao', undefined, [[19, 1, 40, 10]], 2, [29, 6], 'ZL-REU', 'R'),
  room('PLN', 'planejamento', 'planejamento', [[42, 1, 62, 10]], 2, [52, 6], 'ZL-PLN', 'L'),
  room('ENG', 'engenharia', 'engenharia', [[1, 14, 26, 23]], 2, [13, 19], 'ZL-ENG', 'E'),
  room('QUA', 'qualidade', 'qualidade', [[28, 14, 42, 23]], 2, [35, 19], 'ZL-QUA', 'Q'),
  room('SOC', 'soc', 'qualidade', [[47, 14, 62, 23]], 2, [54, 19], 'ZL-SOC', 'S'),
  room('PRJ1', 'projeto', undefined, [[1, 29, 7, 37]], 2, [4, 33], 'ZL-PRJ1', '1'),
  room('PRJ2', 'projeto', undefined, [[9, 29, 15, 37]], 2, [12, 33], 'ZL-PRJ2', '2'),
  room('PRJ3', 'projeto', undefined, [[17, 29, 23, 37]], 2, [20, 33], 'ZL-PRJ3', '3'),
  room('PRJ4', 'projeto', undefined, [[25, 29, 31, 37]], 2, [28, 33], 'ZL-PRJ4', '4'),
  room('ENT', 'entrega', 'entrega', [[36, 29, 46, 37]], 2, [41, 33], 'ZL-ENT', 'G'),
  room('SRV', 'servidores', undefined, [[48, 29, 53, 37]], 2, [50, 33], 'ZL-SRV', 'V'),
  room('BIB', 'biblioteca', 'biblioteca', [[55, 29, 62, 37]], 2, [58, 33], 'ZL-BIB', 'B'),
  room('REC', 'recepcao', undefined, [[1, 41, 16, 50]], 2, [8, 46], 'ZL-REC', 'H'),
  room('WC', 'banheiros', undefined, [[18, 41, 23, 50]], 2, [20, 46], 'ZL-WC', 'W'),
  room('COP', 'copa', undefined, [[25, 41, 53, 50]], 2, [39, 46], 'ZL-COP', 'C'),
  // The terrace has no north "face": only the guard rail row (y=41) is blocked.
  room('TER', 'terraco', undefined, [[55, 41, 62, 50]], 1, [58, 46], 'ZL-TER', 'T'),
  room('COR1', 'corredor', undefined, [[1, 12, 62, 13]], 0, undefined, 'ZL-COR1', '.'),
  room('COR2', 'corredor', undefined, [[1, 25, 62, 28]], 0, [31, 26], 'ZL-COR2', '.'),
  room('COR3', 'corredor', undefined, [[1, 39, 62, 40]], 0, undefined, 'ZL-COR3', '.'),
  room('PAS1', 'passagem', undefined, [[44, 14, 45, 24]], 0, undefined, 'ZL-COR1', '.'),
  room('PAS2', 'passagem', undefined, [[33, 29, 34, 38]], 0, undefined, 'ZL-COR2', '.'),
];
const roomIndex = new Map(ROOMS.map((r, i) => [r.id, i]));
const inRect = (x, y, [x1, y1, x2, y2]) => x >= x1 && x <= x2 && y >= y1 && y <= y2;
const ownerOf = (x, y) => ROOMS.find((r) => r.rects.some((rc) => inRect(x, y, rc)));

// ---------------------------------------------------------------- doors (MAPA.md section 3)
const DOORS = [
  ['DR-DIR', [8, 11, 9, 11], 'DIR', 'COR1'],
  ['DR-REU', [29, 11, 30, 11], 'REU', 'COR1'],
  ['DR-PLN', [50, 11, 51, 11], 'PLN', 'COR1'],
  ['DR-ENG-N', [13, 14, 14, 15], 'ENG', 'COR1'],
  ['DR-ENG-S', [13, 24, 14, 24], 'ENG', 'COR2'],
  ['DR-QUA-N', [33, 14, 34, 15], 'QUA', 'COR1'],
  ['DR-QUA-S', [33, 24, 34, 24], 'QUA', 'COR2'],
  ['DR-SOC', [52, 24, 53, 24], 'SOC', 'COR2'],
  ['DR-PRJ1', [2, 29, 3, 30], 'PRJ1', 'COR2'],
  ['DR-PRJ2', [10, 29, 11, 30], 'PRJ2', 'COR2'],
  ['DR-PRJ3', [18, 29, 19, 30], 'PRJ3', 'COR2'],
  ['DR-PRJ4', [26, 29, 27, 30], 'PRJ4', 'COR2'],
  ['DR-ENT', [38, 29, 39, 30], 'ENT', 'COR2'],
  ['DR-SRV', [48, 29, 49, 30], 'SRV', 'COR2'],
  ['DR-BIB', [56, 29, 57, 30], 'BIB', 'COR2'],
  ['DR-REC-N', [2, 41, 3, 42], 'REC', 'COR3'],
  // "RUA" (street) is outside the map: it is not a room, only the other end of the entrance door.
  ['DR-ENTRADA', [8, 51, 9, 51], 'REC', 'RUA'],
  ['DR-WC1', [19, 41, 19, 42], 'WC', 'COR3'],
  ['DR-WC2', [22, 41, 22, 42], 'WC', 'COR3'],
  ['DR-COP', [38, 41, 39, 42], 'COP', 'COR3'],
  ['DR-TER', [54, 47, 54, 48], 'COP', 'TER'],
].map(([id, [x1, y1, x2, y2], a, b]) => {
  const tiles = [];
  for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) tiles.push([x, y]);
  return { id, tiles, connects: [a, b] };
});

// ---------------------------------------------------------------- plan consistency checks
{
  const problems = [];
  const letterToRoom = new Map(ROOMS.filter((r) => r.letter !== '.').map((r) => [r.letter, r.id]));
  const doorTiles = new Set(DOORS.flatMap((d) => d.tiles.map(([x, y]) => `${x},${y}`)));
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const ch = charAt(x, y);
      const owner = ownerOf(x, y);
      if (ch === '+') {
        if (!doorTiles.has(`${x},${y}`))
          problems.push(`plan door '+' at (${x},${y}) is in no door`);
      } else if (ch === '#' || ch === 'g') {
        if (owner) problems.push(`wall '${ch}' at (${x},${y}) is inside room ${owner.id}`);
      } else if (ch === '.') {
        if (!owner || owner.letter !== '.')
          problems.push(`corridor '.' at (${x},${y}) is not in a corridor rect`);
      } else if (!owner || owner.id !== letterToRoom.get(ch)) {
        problems.push(`'${ch}' at (${x},${y}) does not belong to room ${letterToRoom.get(ch)}`);
      }
    }
  }
  for (const d of DOORS) {
    for (const [x, y] of d.tiles)
      if (charAt(x, y) !== '+') problems.push(`door ${d.id} tile (${x},${y}) is not '+'`);
  }
  if (problems.length > 0)
    throw new Error(`MAPA.md plan is inconsistent:\n${problems.slice(0, 20).join('\n')}`);
}

// ---------------------------------------------------------------- desks and seats (MAPA.md section 6)
const desk = (id, roomId, department, seat, table, vacancy, decor, facing = 'south') => ({
  id,
  room: roomId,
  department,
  seat,
  facing,
  table,
  vacancy,
  decor,
});
const DESKS = [
  desk('DIR-00', 'DIR', 'diretoria', [9, 4], [7, 5, 11, 6], false, ['leather-chair', 'nameplate']),
  desk('PLN-01', 'PLN', 'planejamento', [45, 5], [44, 6, 46, 7], false, ['postits']),
  desk('PLN-02', 'PLN', 'planejamento', [51, 5], [50, 6, 52, 7], false, [
    'blueprint-rolls',
    'clipboard',
  ]),
  desk('PLN-03', 'PLN', 'planejamento', [57, 5], [56, 6, 58, 7], false, ['drawing-tablet']),
  desk('PLN-V1', 'PLN', 'planejamento', [61, 5], [60, 6, 62, 7], true),
  desk('ENG-01', 'ENG', 'engenharia', [3, 17], [2, 18, 4, 19], false, ['dual-monitors']),
  desk('ENG-02', 'ENG', 'engenharia', [7, 17], [6, 18, 8, 19], false, [
    'dual-monitors',
    'rubber-duck',
  ]),
  desk('ENG-03', 'ENG', 'engenharia', [11, 17], [10, 18, 12, 19], false, ['purple-mug']),
  desk('ENG-04', 'ENG', 'engenharia', [17, 17], [15, 18, 19, 19], false, [
    'protoboard',
    'soldering-iron',
    'oscilloscope',
  ]),
  desk('ENG-05', 'ENG', 'engenharia', [23, 17], [22, 18, 24, 19], false, ['plc-leds']),
  desk('ENG-V1', 'ENG', 'engenharia', [3, 21], [2, 22, 4, 23], true),
  desk('ENG-V2', 'ENG', 'engenharia', [7, 21], [6, 22, 8, 23], true),
  desk('ENG-V3', 'ENG', 'engenharia', [11, 21], [10, 22, 12, 23], true),
  desk('QUA-01', 'QUA', 'qualidade', [31, 17], [30, 18, 32, 19], false, ['magnifier', 'clipboard']),
  desk('QUA-02', 'QUA', 'qualidade', [36, 17], [35, 18, 37, 19], false, ['printed-pull-requests']),
  desk('QUA-V1', 'QUA', 'qualidade', [31, 21], [30, 22, 32, 23], true),
  desk('QUA-V2', 'QUA', 'qualidade', [36, 21], [35, 22, 37, 23], true),
  desk('SOC-01', 'SOC', 'qualidade', [50, 17], [49, 18, 51, 19], false, ['two-screen-console']),
  desk('SOC-02', 'SOC', 'qualidade', [55, 17], [54, 18, 56, 19], false, ['laptop-stickers']),
  desk('SOC-V1', 'SOC', 'qualidade', [60, 17], [59, 18, 61, 19], true),
  desk('ENT-01', 'ENT', 'entrega', [37, 32], [36, 33, 38, 34], false, ['git-monitor']),
  desk('ENT-02', 'ENT', 'entrega', [41, 32], [40, 33, 42, 34], false, ['typewriter']),
  desk('ENT-V1', 'ENT', 'entrega', [45, 32], [44, 33, 46, 34], true),
  desk('BIB-01', 'BIB', 'biblioteca', [59, 33], [58, 34, 60, 35], false, [
    'book-stack',
    'reading-lamp',
  ]),
  // Reading armchair (vacancy): no table, faces east, lamp at (56,36).
  desk(
    'BIB-V1',
    'BIB',
    'biblioteca',
    [57, 36],
    undefined,
    true,
    ['armchair', 'reading-lamp'],
    'east',
  ),
  // Provisional desks for hires without a free desk (no department).
  desk('FL-D1', 'REC', undefined, [2, 45], [1, 46, 3, 47], true, ['visitor-badge']),
  desk('FL-D2', 'REC', undefined, [14, 45], [13, 46, 15, 47], true, ['visitor-badge']),
];

const seat = (id, roomId, tile, facing, kind) => ({ id, room: roomId, tile, facing, kind });
const SEATS = [
  seat('DIR-V1', 'DIR', [8, 8], 'north', 'visitor'),
  seat('DIR-V2', 'DIR', [10, 8], 'north', 'visitor'),
];
[24, 26, 28, 30, 32, 34].forEach((x, i) => {
  SEATS.push(seat(`REU-${String(i + 1).padStart(2, '0')}`, 'REU', [x, 5], 'south', 'meeting'));
  SEATS.push(seat(`REU-${String(i + 7).padStart(2, '0')}`, 'REU', [x, 8], 'north', 'meeting'));
});
SEATS.push(seat('REU-13', 'REU', [22, 6], 'east', 'meeting'));
SEATS.push(seat('REU-14', 'REU', [37, 6], 'west', 'meeting'));
SEATS.push(seat('FL-S1', 'REC', [13, 49], 'north', 'sofa'));
SEATS.push(seat('FL-S2', 'REC', [14, 49], 'north', 'sofa'));
const PROJECT_COLS = [1, 9, 17, 25]; // `a` of MAPA.md section 5
PROJECT_COLS.forEach((a, i) => {
  const n = i + 1;
  [
    [a + 2, 33, 'south'],
    [a + 3, 33, 'south'],
    [a + 4, 33, 'south'],
    [a + 2, 36, 'north'],
    [a + 3, 36, 'north'],
    [a + 4, 36, 'north'],
  ].forEach(([x, y, facing], k) =>
    SEATS.push(seat(`PRJ${n}-${k + 1}`, `PRJ${n}`, [x, y], facing, 'project')),
  );
});

// ---------------------------------------------------------------- points of interest (MAPA.md section 8)
const poi = (id, kind, roomId, tiles, facing, capacity, activity, durationSec) => ({
  id,
  kind,
  room: roomId,
  tiles,
  facing,
  capacity,
  activity,
  durationSec,
});
const POIS = [
  poi(
    'POI-CAFE',
    'coffee',
    'COP',
    [
      [29, 44],
      [30, 44],
    ],
    'north',
    2,
    'coffee',
    [20, 90],
  ),
  poi('POI-BEB', 'water', 'COR2', [[36, 26]], 'north', 1, 'water', [8, 25]),
  poi(
    'POI-FLIP',
    'arcade',
    'COP',
    [
      [48, 45],
      [51, 45],
    ],
    'north',
    2,
    'arcade',
    [30, 120],
  ),
  // Ping-pong: (46,47) faces east and (52,48) faces west (toward the table); `facing` omitted on purpose.
  poi(
    'POI-PING',
    'pingpong',
    'COP',
    [
      [46, 47],
      [52, 48],
    ],
    undefined,
    2,
    'pingpong',
    [30, 90],
  ),
  // MAPA.md has a single POI-JAN spanning 4 rooms; the contract allows one room per POI, so it is split.
  poi(
    'POI-JAN-COP',
    'window',
    'COP',
    [
      [53, 45],
      [53, 49],
    ],
    'east',
    2,
    'window',
    [10, 40],
  ),
  poi('POI-JAN-REU', 'window', 'REU', [[37, 3]], 'north', 1, 'window', [10, 40]),
  poi('POI-JAN-DIR', 'window', 'DIR', [[4, 3]], 'north', 1, 'window', [10, 40]),
  poi('POI-JAN-BIB', 'window', 'BIB', [[59, 31]], 'north', 1, 'window', [10, 40]),
  poi(
    'POI-TER',
    'terrace',
    'TER',
    [
      [57, 47],
      [59, 47],
      [61, 47],
      [60, 42],
    ],
    undefined,
    4,
    'terrace',
    [30, 120],
  ),
  poi('POI-REDE', 'hammock', 'TER', [[59, 44]], undefined, 1, 'hammock', [30, 120]),
  poi(
    'POI-COPA',
    'copa-table',
    'COP',
    [
      [32, 45],
      [36, 45],
      [32, 49],
      [36, 49],
    ],
    undefined,
    4,
    'chat',
    [20, 90],
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
    'north',
    3,
    'tv',
    [30, 120],
  ),
  poi(
    'POI-WC',
    'bathroom-door',
    'WC',
    [
      [19, 42],
      [22, 42],
    ],
    undefined,
    2,
    'bathroom',
    [20, 60],
  ),
  poi(
    'POI-SOFA-REC',
    'reception-wait',
    'REC',
    [
      [13, 49],
      [14, 49],
    ],
    'north',
    2,
    'wait',
    [30, 120],
  ),
];
// Approval queue FILA-1..8 in COR1, facing west (toward the Diretoria door). They are POIs so that the
// ids in `spawn.approvalQueue` resolve to tiles.
for (let n = 1; n <= 8; n++) {
  POIS.push(
    poi(`FILA-${n}`, 'director-door-wait', 'COR1', [[8 + n, 12]], 'west', 1, 'wait', [30, 600]),
  );
}

// ---------------------------------------------------------------- objects (MAPA.md section 7)
// `solid` and `holes` are generator-only (they feed the collision bitset and are not written out).
const objects = [];
const obj = (id, sprite, x, y, w, h, opts = {}) =>
  objects.push({
    id,
    sprite: `props/${sprite}`,
    tile: [x, y],
    footprint: [w, h],
    anim: opts.anim ?? null,
    light: opts.light ?? null,
    solid: opts.solid ?? true,
    holes: opts.holes ?? [],
  });
const decor = (id, sprite, x, y, w, h, opts = {}) =>
  obj(id, sprite, x, y, w, h, { ...opts, solid: false });

// Diretoria
decor('estante-dir', 'bookshelf', 1, 1, 4, 2);
decor('metas-do-mes', 'board-goals', 13, 1, 4, 2);
obj('trofeu', 'trophy', 16, 4, 1, 1);
obj('planta-dir-1', 'plant', 1, 9, 1, 1);
obj('planta-dir-2', 'plant', 16, 9, 1, 1);
obj('luminaria-dir', 'floor-lamp', 15, 6, 1, 1);
decor('tapete-dir', 'rug-gold', 5, 4, 9, 6);
// Reuniao
decor('tv-reuniao', 'tv-wall', 26, 1, 8, 2);
decor('quadro-branco', 'whiteboard', 20, 1, 5, 2);
obj('mesa-reuniao', 'meeting-table', 23, 6, 14, 2);
obj('planta-reu-1', 'plant', 20, 9, 1, 1);
obj('planta-reu-2', 'plant', 39, 9, 1, 1);
// Planejamento
decor('postits-pln', 'postit-wall', 43, 1, 5, 2);
decor('diagrama-pln', 'diagram-wall', 49, 1, 5, 2);
decor('paleta-pln', 'palette-wall', 55, 1, 5, 2);
obj('mesa-plantas', 'blueprint-table', 53, 9, 3, 2);
obj('sofa-brainstorm', 'sofa', 44, 9, 4, 2);
decor('tapete-pln', 'rug-lilac', 43, 4, 19, 5);
// Engenharia
obj('estante-pecas', 'parts-shelf', 14, 16, 1, 1);
obj('cabide-epi', 'coat-rack-ppe', 26, 17, 1, 1);
decor('painel-eletrico', 'electrical-panel', 21, 14, 5, 2);
obj('planta-eng-1', 'plant', 1, 23, 1, 1);
obj('planta-eng-2', 'plant', 26, 23, 1, 1);
decor('tapete-eng', 'rug-blue', 1, 16, 13, 8);
// Qualidade
decor('quadro-bugs', 'board-bugs', 38, 14, 4, 2);
obj('estante-relatorios', 'report-shelf', 29, 16, 1, 1);
decor('tapete-qua', 'rug-green', 29, 16, 13, 8);
// SOC
decor('teloes-soc', 'soc-screens', 47, 14, 10, 2);
decor('cadeado-soc', 'giant-padlock', 58, 14, 4, 2);
// Entrega
decor('estante-manuais', 'manuals-shelf', 36, 29, 2, 2);
decor('quadro-branches', 'board-branches', 41, 29, 6, 2);
decor('tapete-ent', 'rug-orange', 37, 31, 10, 6);
// Servidores
decor('racks-srv', 'server-racks', 50, 29, 4, 2, { anim: 'leds' });
obj('rack-lateral-1', 'server-rack', 53, 32, 1, 2, { anim: 'leds' });
obj('rack-lateral-2', 'server-rack', 53, 35, 1, 2, { anim: 'leds' });
// Biblioteca
decor('estantes-bib', 'tall-shelves', 58, 29, 5, 2);
obj('estante-leste', 'tall-shelf', 62, 33, 1, 5);
obj('estante-oeste', 'tall-shelf', 55, 33, 1, 5);
obj('abajur-bib', 'table-lamp', 61, 35, 1, 1);
obj('globo-bib', 'globe', 57, 34, 1, 1);
obj('escada-livros', 'book-ladder', 61, 31, 1, 2);
obj('abajur-poltrona', 'table-lamp', 56, 36, 1, 1);
decor('tapete-bib', 'rug-wine', 56, 31, 6, 7);
// Recepcao
obj('balcao-rec', 'reception-counter', 5, 45, 6, 2);
decor('logo-rec', 'studio-logo', 6, 41, 6, 2);
decor('painel-projetos', 'board-projects', 12, 41, 4, 2);
obj('sofa-rec', 'sofa', 12, 49, 4, 2, {
  holes: [
    [13, 49],
    [14, 49],
  ],
});
obj('planta-rec', 'tall-plant', 16, 43, 1, 1);
decor('tapete-rec', 'rug-teal', 4, 43, 8, 2);
// Copa
decor('geladeira', 'fridge', 26, 41, 2, 2);
obj('bancada-copa', 'counter', 28, 43, 4, 1);
obj('cafeteira', 'coffee-machine', 29, 43, 1, 1, { anim: 'steam' });
decor('maquina-lanches', 'snack-machine', 33, 41, 2, 2);
decor('tv-copa', 'tv-wall', 41, 41, 5, 2);
obj('sofa-copa', 'sofa', 41, 45, 5, 2, {
  holes: [
    [42, 46],
    [43, 46],
    [44, 46],
  ],
});
obj('mesinha-copa', 'coffee-table', 42, 43, 3, 1);
obj('mesa-redonda', 'round-table', 33, 46, 3, 3);
obj('fliperama-1', 'arcade-cabinet', 48, 43, 2, 2, { anim: 'blink' });
obj('fliperama-2', 'arcade-cabinet', 51, 43, 2, 2, { anim: 'blink' });
obj('mesa-pingpong', 'pingpong-table', 47, 47, 5, 2);
obj('planta-copa-1', 'plant', 25, 43, 1, 1);
obj('planta-copa-2', 'plant', 53, 43, 1, 1);
obj('planta-copa-3', 'plant', 25, 50, 1, 1);
decor('cama-pacoca', 'pet-bed', 27, 49, 1, 1);
decor('cama-biscoito', 'pet-bed', 29, 49, 1, 1);
decor('tigela-pets', 'pet-bowl', 26, 50, 1, 1);
// Terraco
obj('rede', 'hammock', 57, 44, 5, 1, { holes: [[59, 44]] });
decor('pufe-1', 'pouf', 57, 47, 1, 1);
decor('pufe-2', 'pouf', 59, 47, 1, 1);
decor('pufe-3', 'pouf', 61, 47, 1, 1);
decor('cordao-luzes', 'string-lights', 55, 41, 8, 1);
[
  [62, 43],
  [62, 46],
  [62, 49],
  [56, 50],
  [60, 50],
].forEach(([x, y], i) => obj(`planta-ter-${i + 1}`, 'plant', x, y, 1, 1));
// Corredores
obj('planta-cor1-1', 'plant', 1, 12, 1, 1);
obj('planta-cor1-2', 'plant', 62, 12, 1, 1);
obj('bebedouro', 'water-cooler', 36, 25, 1, 1);
obj('quadro-avisos', 'notice-board', 20, 25, 4, 1);
[2, 14, 26, 41, 48, 60].forEach((x, i) => obj(`planta-cor2-${i + 1}`, 'plant', x, 25, 1, 1));
obj('banco-cor2-1', 'bench', 10, 27, 1, 1);
obj('banco-cor2-2', 'bench', 50, 27, 1, 1);
[1, 31, 62].forEach((x, i) => obj(`planta-cor3-${i + 1}`, 'plant', x, 39, 1, 1));
obj('banco-cor3', 'bench', 24, 40, 1, 1);

// ---------------------------------------------------------------- light zones and lights (MAPA.md section 10)
const zone = (id, rooms, mode) => ({ id, rooms, mode });
const LIGHT_ZONES = [
  zone('ZL-DIR', ['DIR'], 'night'),
  zone('ZL-REU', ['REU'], 'night'),
  zone('ZL-PLN', ['PLN'], 'night'),
  zone('ZL-ENG', ['ENG'], 'night'),
  zone('ZL-QUA', ['QUA'], 'always'),
  zone('ZL-SOC', ['SOC'], 'always'),
  zone('ZL-PRJ1', ['PRJ1'], 'activity'),
  zone('ZL-PRJ2', ['PRJ2'], 'activity'),
  zone('ZL-PRJ3', ['PRJ3'], 'activity'),
  zone('ZL-PRJ4', ['PRJ4'], 'activity'),
  zone('ZL-ENT', ['ENT'], 'always'),
  zone('ZL-SRV', ['SRV'], 'always'),
  zone('ZL-BIB', ['BIB'], 'night'),
  zone('ZL-REC', ['REC'], 'night'),
  zone('ZL-WC', ['WC'], 'night'),
  zone('ZL-COP', ['COP'], 'night'),
  zone('ZL-TER', ['TER'], 'night'),
  zone('ZL-COR1', ['COR1', 'PAS1'], 'always'),
  zone('ZL-COR2', ['COR2', 'PAS2'], 'always'),
  zone('ZL-COR3', ['COR3'], 'always'),
];
const WARM = { sprite: 'light/warm-48', color: '#ffd9a0' };
const COLD = { sprite: 'light/cold-48', color: '#cfe6ff' };
const SCREEN = { sprite: 'light/screen-48', color: '#4f8cff' };
const LIGHT_SPEC = [
  [
    'ZL-DIR',
    WARM,
    [
      [4, 5],
      [15, 6],
      [9, 3],
    ],
  ],
  [
    'ZL-REU',
    WARM,
    [
      [25, 3],
      [31, 3],
      [37, 9],
    ],
  ],
  [
    'ZL-PLN',
    WARM,
    [
      [45, 4],
      [51, 4],
      [57, 4],
    ],
  ],
  [
    'ZL-ENG',
    WARM,
    [
      [4, 16],
      [12, 16],
      [20, 16],
    ],
  ],
  [
    'ZL-QUA',
    COLD,
    [
      [31, 16],
      [36, 16],
    ],
  ],
  [
    'ZL-SOC',
    SCREEN,
    [
      [49, 16],
      [55, 16],
    ],
  ],
  ['ZL-PRJ1', WARM, [[7, 31]]],
  ['ZL-PRJ2', WARM, [[15, 31]]],
  ['ZL-PRJ3', WARM, [[23, 31]]],
  ['ZL-PRJ4', WARM, [[31, 31]]],
  [
    'ZL-ENT',
    WARM,
    [
      [40, 31],
      [45, 31],
    ],
  ],
  ['ZL-SRV', SCREEN, [[50, 33]]],
  [
    'ZL-BIB',
    WARM,
    [
      [61, 35],
      [57, 34],
    ],
  ],
  [
    'ZL-REC',
    WARM,
    [
      [4, 44],
      [13, 44],
    ],
  ],
  [
    'ZL-COP',
    WARM,
    [
      [30, 43],
      [43, 43],
      [50, 45],
    ],
  ],
  ['ZL-TER', WARM, [[58, 42]]],
  [
    'ZL-COR1',
    WARM,
    [
      [4, 12],
      [12, 12],
      [20, 12],
      [28, 12],
      [36, 12],
      [44, 12],
      [52, 12],
      [60, 12],
    ],
  ],
  [
    'ZL-COR2',
    WARM,
    [
      [4, 26],
      [12, 26],
      [20, 26],
      [28, 26],
      [36, 26],
      [44, 26],
      [52, 26],
      [60, 26],
    ],
  ],
  [
    'ZL-COR3',
    WARM,
    [
      [4, 39],
      [12, 39],
      [20, 39],
      [28, 39],
      [36, 39],
      [44, 39],
      [52, 39],
      [60, 39],
    ],
  ],
];
const LIGHTS = LIGHT_SPEC.flatMap(([zoneId, style, tiles]) =>
  tiles.map((tile, i) => ({
    id: `lamp-${zoneId.slice(3).toLowerCase()}-${i + 1}`,
    zone: zoneId,
    tile,
    sprite: style.sprite,
    color: style.color,
  })),
);

// ---------------------------------------------------------------- windows (MAPA.md section 9)
const win = (id, roomId, rect, view) => ({ id, room: roomId, rect, view });
const WINDOWS = [
  win('W-01', 'DIR', [6, 1, 12, 2], 'city'),
  win('W-02', 'REU', [35, 1, 39, 2], 'sky'),
  win('W-03', 'PLN', [60, 1, 62, 2], 'sky'),
  win('W-04', 'ENG', [0, 16, 0, 19], 'garden'),
  win('W-05', 'BIB', [63, 31, 63, 32], 'garden'),
  win('W-06A', 'REC', [3, 51, 6, 51], 'city'),
  win('W-06B', 'REC', [11, 51, 14, 51], 'city'),
  win('W-07A', 'COP', [54, 43, 54, 46], 'sky'),
  win('W-07B', 'COP', [54, 49, 54, 50], 'sky'),
];

// ---------------------------------------------------------------- boards and project slots
const BOARDS = [
  { id: 'metas-do-mes', kind: 'metas', room: 'DIR', rect: [13, 1, 16, 2] },
  { id: 'bugs', kind: 'bugs', room: 'QUA', rect: [38, 14, 41, 15] },
  { id: 'branches', kind: 'git-branches', room: 'ENT', rect: [41, 29, 46, 30] },
  { id: 'tv-reuniao', kind: 'tv-kanban', room: 'REU', rect: [26, 1, 33, 2] },
  { id: 'recepcao-projetos', kind: 'active-projects', room: 'REC', rect: [12, 41, 15, 42] },
];
const PROJECT_SLOTS = PROJECT_COLS.map((a, i) => ({
  slot: i,
  room: `PRJ${i + 1}`,
  doorSign: [a, 28, a + 6, 28],
  board: [a + 3, 29, a + 6, 30],
  progressBar: [a + 1, 29, a + 2, 29],
  seats: [1, 2, 3, 4, 5, 6].map((k) => `PRJ${i + 1}-${k}`),
}));

// ---------------------------------------------------------------- tile layers and collision
const cells = COLS * ROWS;
const floor = new Array(cells).fill(0);
const walls = new Array(cells).fill(0);
const blocked = new Array(cells).fill(0);
const at = (x, y) => y * COLS + x;
const block = (x, y) => {
  if (x >= 0 && y >= 0 && x < COLS && y < ROWS) blocked[at(x, y)] = 1;
};
const blockRect = ([x1, y1, x2, y2]) => {
  for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) block(x, y);
};

for (let y = 0; y < ROWS; y++) {
  for (let x = 0; x < COLS; x++) {
    const ch = charAt(x, y);
    if (ch === '#') {
      walls[at(x, y)] = 1;
      blocked[at(x, y)] = 1;
    } else if (ch === 'g') {
      walls[at(x, y)] = 2;
      blocked[at(x, y)] = 1;
    } else if (ch === '+') {
      const door = DOORS.find((d) => d.tiles.some(([dx, dy]) => dx === x && dy === y));
      const owner = ROOMS[roomIndex.get(door.connects[0])];
      floor[at(x, y)] = roomIndex.get(owner.id) + 1;
    } else {
      floor[at(x, y)] = roomIndex.get(ownerOf(x, y).id) + 1;
    }
  }
}
// North face rows of each room are blocked, except door tiles.
for (const r of ROOMS) {
  if (r.face === 0) continue;
  for (const [x1, y1, x2] of r.rects) {
    for (let y = y1; y < y1 + r.face; y++) {
      for (let x = x1; x <= x2; x++) {
        if (charAt(x, y) === '+') continue;
        walls[at(x, y)] = 3;
        blocked[at(x, y)] = 1;
      }
    }
  }
}
// Bathroom interior is not rendered: NPCs only enter through the door tiles and vanish.
blockRect([18, 43, 23, 50]);
for (const d of DESKS) if (d.table) blockRect(d.table);
for (const o of objects) {
  if (!o.solid) continue;
  blockRect([o.tile[0], o.tile[1], o.tile[0] + o.footprint[0] - 1, o.tile[1] + o.footprint[1] - 1]);
}
for (const o of objects) for (const [x, y] of o.holes) blocked[at(x, y)] = 0;

const bytes = new Uint8Array(Math.ceil(cells / 8));
blocked.forEach((v, i) => {
  if (v) bytes[i >> 3] |= 1 << (i & 7);
});
const collision = Buffer.from(bytes).toString('base64');

// ---------------------------------------------------------------- assemble and write
const doorsOfRoom = (roomId) => DOORS.filter((d) => d.connects.includes(roomId)).map((d) => d.id);
const strip = (o) => JSON.parse(JSON.stringify(o)); // drops `undefined` fields

const map = {
  schema: 'mapa/v1',
  tileSize: 16,
  cols: COLS,
  rows: ROWS,
  // Placeholder tileset entry: the real art is chosen in the asset task (ASSETS.md / CREDITS).
  tilesets: [
    { id: 'interior', image: 'tilesets/interior.png', columns: 32, license: 'CREDITS#interior' },
  ],
  layers: {
    floor: '__LAYER__floor',
    walls: '__LAYER__walls',
    decorBelow: '__LAYER__decorBelow',
    decorAbove: '__LAYER__decorAbove',
  },
  collision,
  rooms: ROOMS.map((r) =>
    strip({
      id: r.id,
      kind: r.kind,
      department: r.department,
      nameKey: `room.${r.id}`,
      rects: r.rects,
      faceRows: r.face > 0 ? r.face : undefined,
      doors: doorsOfRoom(r.id),
      lightZone: r.zone,
      camera: r.camera,
    }),
  ),
  doors: DOORS,
  desks: DESKS.map(strip),
  seats: SEATS,
  pois: POIS.map(strip),
  objects: objects.map((o) => ({
    id: o.id,
    sprite: o.sprite,
    tile: o.tile,
    footprint: o.footprint,
    anim: o.anim,
    light: o.light,
  })),
  lightZones: LIGHT_ZONES,
  lights: LIGHTS,
  windows: WINDOWS,
  boards: BOARDS,
  projectSlots: PROJECT_SLOTS,
  spawn: {
    entrance: 'DR-ENTRADA',
    receptionCounter: [8, 47],
    approvalQueue: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `FILA-${n}`),
    provisionalDesks: ['FL-D1', 'FL-D2'],
    freelancerSofa: ['FL-S1', 'FL-S2'],
  },
  pets: {
    beds: { pacoca: [27, 49], biscoito: [29, 49] },
    forbiddenRooms: ['SOC', 'PRJ1', 'PRJ2', 'PRJ3', 'PRJ4'],
  },
};

const layerText = (values) => {
  const lines = [];
  for (let y = 0; y < ROWS; y++)
    lines.push(`      ${values.slice(y * COLS, (y + 1) * COLS).join(', ')}`);
  return `[\n${lines.join(',\n')}\n    ]`;
};
let text = JSON.stringify(map, null, 2)
  // Collapse arrays that only hold numbers onto one line, e.g. [8, 11].
  .replace(/\[\s*-?\d+(?:\s*,\s*-?\d+)*\s*\]/g, (m) => m.replace(/\s+/g, '').replace(/,/g, ', '));
const layers = {
  floor,
  walls,
  decorBelow: new Array(cells).fill(0),
  decorAbove: new Array(cells).fill(0),
};
for (const [name, values] of Object.entries(layers)) {
  text = text.replace(`"__LAYER__${name}"`, layerText(values));
}
text += '\n';

const outDir = join(root, 'assets', 'map');
mkdirSync(outDir, { recursive: true });
const target = join(outDir, 'mapa.json');
const tmp = `${target}.tmp`;
writeFileSync(tmp, text, 'utf8');
renameSync(tmp, target); // atomic replace
console.log(
  `wrote assets/map/mapa.json (${COLS}x${ROWS}, ${DESKS.length} desks, ${SEATS.length} seats, ${POIS.length} POIs)`,
);
