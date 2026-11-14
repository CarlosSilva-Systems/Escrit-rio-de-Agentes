// Furniture, rugs and wall decoration painted in code. Each sprite is generated at the size of the
// map footprint (`name@WxH`), padded 1 px for the outline. `ax, ay` = where the footprint's
// top-left corner sits inside the sprite (sprites may extend above the footprint).

import {
  addOutline,
  createSurface,
  hash2,
  px,
  rect,
  type PixelContext,
  type Surface,
} from './pixel';
import { C, SKY } from './palette';

export interface FurnitureArt {
  surface: Surface;
  ax: number;
  ay: number;
}

const PAD = 1;

function disc(ctx: PixelContext, color: string, cx: number, cy: number, r: number): void {
  ctx.fillStyle = color;
  for (let y = -r; y <= r; y++)
    for (let x = -r; x <= r; x++)
      if (x * x + y * y <= r * r + r * 0.6) ctx.fillRect(cx + x, cy + y, 1, 1);
}

function tabletop(
  ctx: PixelContext,
  w: number,
  h: number,
  top: string = C.wallTrim,
  light: string = C.floorHoney,
): void {
  rect(ctx, C.wallTrimDark, 0, h - 8, w, 8); // front face
  rect(ctx, top, 0, 0, w, h - 8); // top surface
  rect(ctx, light, 0, 0, w, 1);
  rect(ctx, '#6F5236', 0, h - 1, w, 1);
  rect(ctx, '#6F5236', 2, h - 8, 2, 8);
  rect(ctx, '#6F5236', w - 4, h - 8, 2, 8);
}

function monitor(ctx: PixelContext, cx: number, w: number, glow: string): void {
  rect(ctx, '#26323F', cx - w / 2, -9, w, 8);
  rect(ctx, glow, cx - w / 2 + 1, -8, w - 2, 5);
  for (let i = 0; i < 3; i++) rect(ctx, '#9FE8C0', cx - w / 2 + 2, -7 + i * 2, w - 5 - i, 1);
  rect(ctx, '#5E6470', cx - 1, -1, 2, 2);
}

function chair(ctx: PixelContext, facing: 's' | 'n' | 'e' | 'w'): void {
  if (facing === 's') {
    rect(ctx, C.tealDeep, 3, 8, 10, 6);
    rect(ctx, C.teal, 3, 1, 10, 7);
    rect(ctx, C.tealDeep, 3, 7, 10, 1);
  } else if (facing === 'n') {
    rect(ctx, C.tealDeep, 3, 3, 10, 6);
    rect(ctx, C.teal, 3, 9, 10, 6);
    rect(ctx, C.tealDeep, 3, 9, 10, 1);
  } else {
    const backX = facing === 'e' ? 2 : 11;
    rect(ctx, C.teal, backX, 2, 3, 12);
    rect(ctx, C.tealDeep, facing === 'e' ? 4 : 3, 8, 9, 6);
  }
}

function plant(ctx: PixelContext, seed: number): void {
  rect(ctx, C.terracotta, 4, 9, 8, 6);
  rect(ctx, C.terracottaLight, 4, 9, 8, 1);
  rect(ctx, '#6F5236', 4, 14, 8, 1);
  const spots: [number, number, number][] = [
    [8, 4, 4],
    [4, 6, 3],
    [12, 6, 3],
    [8, -2, 3],
    [5, 1, 3],
    [11, 1, 3],
  ];
  for (const [x, y, r] of spots) disc(ctx, C.leafDeep, x, y + 1, r);
  for (const [x, y, r] of spots) disc(ctx, C.leaf, x, y, r - (hash2(x, y, seed) > 0.5 ? 0 : 1));
}

function bookRows(
  ctx: PixelContext,
  x: number,
  y: number,
  w: number,
  h: number,
  seed: number,
): void {
  const palette = [C.terracotta, C.teal, C.mustard, C.plum, '#4A7BD0', C.cream, C.leaf];
  for (let by = y; by + 5 <= y + h; by += 6) {
    rect(ctx, C.wallTrimDark, x, by + 5, w, 1);
    let bx = x + 1;
    while (bx < x + w - 2) {
      const bw = 1 + Math.floor(hash2(bx, by, seed) * 2);
      const color = palette[Math.floor(hash2(bx, by, seed + 9) * palette.length)] as string;
      rect(ctx, color, bx, by + 1, bw, 4);
      bx += bw + (hash2(bx, by, seed + 3) > 0.8 ? 1 : 0);
    }
  }
}

function sofa(ctx: PixelContext, w: number, h: number): void {
  rect(ctx, C.tealDeep, 0, 0, w, h); // frame
  rect(ctx, C.teal, 2, 3, w - 4, 8); // back cushion
  rect(ctx, C.tealDeep, 2, 10, w - 4, 1);
  rect(ctx, C.teal, 2, 11, w - 4, h - 14); // seat
  const seats = Math.max(1, Math.round(w / 16));
  for (let i = 1; i < seats; i++) rect(ctx, C.tealDeep, Math.round((w / seats) * i), 11, 1, h - 14);
  rect(ctx, '#1E5A52', 0, h - 2, w, 2);
}

function ledRack(ctx: PixelContext, w: number, h: number, seed: number): void {
  rect(ctx, '#26323F', 0, 0, w, h);
  rect(ctx, '#3A4756', 0, 0, w, 2);
  for (let y = 4; y < h - 2; y += 4) {
    rect(ctx, '#1B2430', 2, y, w - 4, 3);
    for (let x = 3; x < w - 3; x += 3) {
      const c = hash2(x, y, seed);
      px(ctx, c > 0.66 ? '#4FE38B' : c > 0.33 ? '#4A7BD0' : '#F2685A', x, y + 1);
    }
  }
}

const RUG_COLORS: Record<string, string> = {
  diretoria: '#C9962A',
  planejamento: '#9A7DD6',
  engenharia: '#5B94E0',
  qualidade: '#3E9B55',
  entrega: '#E0792B',
  biblioteca: '#8E2F4B',
  recepcao: '#4FB3A5',
  projeto1: '#4FB3A5',
  projeto2: '#C8643F',
  projeto3: '#C9962A',
  projeto4: '#7C4A8A',
};

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v + amount)));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, '0')).join('')}`;
}

function rug(ctx: PixelContext, w: number, h: number, color: string): void {
  rect(ctx, shade(color, -30), 0, 0, w, h);
  rect(ctx, color, 2, 2, w - 4, h - 4);
  rect(ctx, shade(color, 35), 4, 4, w - 8, 1);
  rect(ctx, shade(color, 35), 4, h - 5, w - 8, 1);
  for (let y = 7; y < h - 7; y += 4)
    for (let x = 7 + ((y / 4) % 2) * 2; x < w - 7; x += 4) px(ctx, shade(color, 22), x, y);
}

function windowArt(
  ctx: PixelContext,
  w: number,
  h: number,
  view: string,
  sky: string,
  night: boolean,
): void {
  rect(ctx, C.wallTrim, 0, 0, w, h);
  rect(ctx, sky, 2, 2, w - 4, h - 4);
  const iw = w - 4;
  const ih = h - 4;
  if (view === 'city') {
    for (let x = 0; x < iw; x += 5) {
      const bh = 6 + Math.floor(hash2(x, 3, 5) * (ih - 10));
      rect(ctx, night ? '#101830' : '#8FA3B8', 2 + x, 2 + ih - bh, 4, bh);
      if (night) for (let y = 2 + ih - bh + 2; y < 2 + ih - 2; y += 3) px(ctx, '#FFD98A', 3 + x, y);
    }
  } else if (view === 'garden') {
    disc(ctx, night ? '#14301E' : C.leaf, 2 + iw / 2, 2 + ih - 4, Math.min(8, iw));
  } else if (night) {
    for (let i = 0; i < 6; i++)
      px(
        ctx,
        '#F6EBDD',
        2 + Math.floor(hash2(i, 1, 7) * iw),
        2 + Math.floor(hash2(i, 2, 7) * (ih - 2)),
      );
  } else {
    rect(ctx, '#FFFFFF', 4, 4, Math.min(8, iw - 4), 2);
  }
  rect(ctx, C.wallTrim, Math.floor(w / 2), 2, 1, h - 4); // mullion
  rect(ctx, 'rgba(255,255,255,0.35)', 3, 3, 1, 4);
}

interface Layout {
  up: number;
  down: number;
  paint: (ctx: PixelContext, w: number, h: number) => void;
  outline?: boolean;
}

const LAYOUTS: Record<string, Layout> = {
  'furn/desk': {
    up: 10,
    down: 0,
    paint: (c, w, h) => {
      tabletop(c, w, h);
      monitor(c, Math.floor(w / 2), 13, '#2E7F76');
      rect(c, C.cream, 4, 6, 6, 4);
    },
  },
  'furn/desk-dual': {
    up: 10,
    down: 0,
    paint: (c, w, h) => {
      tabletop(c, w, h);
      monitor(c, Math.floor(w / 2) - 7, 11, '#2E7F76');
      monitor(c, Math.floor(w / 2) + 7, 11, '#2F5E73');
    },
  },
  'furn/desk-empty': { up: 0, down: 0, paint: (c, w, h) => tabletop(c, w, h) },
  'furn/desk-large': {
    up: 4,
    down: 0,
    paint: (c, w, h) => {
      tabletop(c, w, h);
      rect(c, C.cream, 6, 4, 8, 6);
      rect(c, C.teal, w - 14, 5, 7, 5);
    },
  },
  'furn/table': { up: 0, down: 0, paint: (c, w, h) => tabletop(c, w, h) },
  'furn/table-long': {
    up: 0,
    down: 0,
    paint: (c, w, h) => {
      tabletop(c, w, h);
      for (let x = 12; x < w - 12; x += 28) rect(c, C.cream, x, 4, 6, 4);
    },
  },
  'furn/table-round': {
    up: 0,
    down: 0,
    paint: (c, w, h) => {
      disc(c, C.wallTrimDark, w / 2, h / 2 + 2, Math.floor(w / 2) - 1);
      disc(c, C.wallTrim, w / 2, h / 2, Math.floor(w / 2) - 1);
      disc(c, C.floorHoney, w / 2 - 3, h / 2 - 4, 3);
    },
  },
  'furn/chair-s': { up: 0, down: 0, paint: (c) => chair(c, 's') },
  'furn/chair-n': { up: 0, down: 0, paint: (c) => chair(c, 'n') },
  'furn/chair-e': { up: 0, down: 0, paint: (c) => chair(c, 'e') },
  'furn/chair-w': { up: 0, down: 0, paint: (c) => chair(c, 'w') },
  'furn/plant': { up: 12, down: 0, paint: (c) => plant(c, 1) },
  'furn/lamp': {
    up: 14,
    down: 0,
    paint: (c) => {
      rect(c, '#5E6470', 7, -2, 2, 15);
      rect(c, '#5E6470', 5, 13, 6, 2);
      rect(c, '#F6EBDD', 4, -10, 8, 8);
      rect(c, '#FFD9A0', 5, -9, 6, 6);
    },
  },
  'furn/trophy': {
    up: 6,
    down: 0,
    paint: (c) => {
      rect(c, '#8C6A47', 4, 11, 8, 4);
      rect(c, C.mustard, 7, 7, 2, 4);
      rect(c, '#EDBE45', 4, 1, 8, 6);
      rect(c, C.mustard, 3, 2, 1, 3);
      rect(c, C.mustard, 12, 2, 1, 3);
    },
  },
  'furn/shelf-small': {
    up: 8,
    down: 0,
    paint: (c, w, h) => {
      rect(c, C.wallTrimDark, 0, -6, w, h + 6);
      bookRows(c, 1, -5, w - 2, h + 4, 3);
    },
  },
  'furn/shelf-tall': {
    up: 0,
    down: 0,
    paint: (c, w, h) => {
      rect(c, C.wallTrimDark, 0, 0, w, h);
      bookRows(c, 1, 1, w - 2, h - 2, 8);
    },
  },
  'furn/coat-rack': {
    up: 12,
    down: 0,
    paint: (c) => {
      rect(c, '#5E6470', 7, -8, 2, 22);
      rect(c, '#D7E23B', 3, -4, 5, 9);
      rect(c, '#D4C3B0', 3, 0, 5, 1);
      rect(c, C.cream, 9, -9, 5, 4);
    },
  },
  'furn/globe': {
    up: 4,
    down: 0,
    paint: (c) => {
      rect(c, '#6F5236', 6, 12, 4, 3);
      disc(c, C.tealDeep, 8, 7, 5);
      rect(c, C.leaf, 6, 5, 3, 3);
    },
  },
  'furn/ladder': {
    up: 0,
    down: 0,
    paint: (c, w, h) => {
      rect(c, C.wallTrimDark, 3, 0, 2, h);
      rect(c, C.wallTrimDark, w - 5, 0, 2, h);
      for (let y = 3; y < h; y += 5) rect(c, C.wallTrim, 3, y, w - 6, 2);
    },
  },
  'furn/rack': { up: 6, down: 0, paint: (c, w, h) => ledRack(c, w, h + 6, 4) },
  'furn/counter': {
    up: 4,
    down: 0,
    paint: (c, w, h) => {
      rect(c, C.teal, 0, 0, w, h);
      rect(c, C.cream, 0, -4, w, 8);
      rect(c, '#B5A18C', 0, 3, w, 1);
      rect(c, C.tealDeep, 0, h - 2, w, 2);
    },
  },
  'furn/coffee-machine': {
    up: 8,
    down: 0,
    paint: (c) => {
      rect(c, '#2A2320', 4, -6, 8, 12);
      rect(c, '#5E6470', 5, -5, 6, 4);
      px(c, '#F2685A', 6, 1);
      rect(c, C.cream, 6, 4, 4, 2);
      px(c, '#D4C3B0', 8, -9);
      px(c, '#D4C3B0', 9, -8);
    },
  },
  'furn/water-cooler': {
    up: 8,
    down: 0,
    paint: (c) => {
      rect(c, C.cream, 4, 3, 8, 12);
      rect(c, '#9FD8E8', 5, -8, 6, 11);
      rect(c, '#5E6470', 6, 6, 4, 2);
    },
  },
  'furn/noticeboard': {
    up: 0,
    down: 0,
    paint: (c, w, h) => {
      rect(c, C.wallTrimDark, 0, 0, w, h);
      rect(c, '#C99B66', 2, 2, w - 4, h - 4);
      for (let x = 5; x < w - 8; x += 9)
        rect(c, hash2(x, 1, 2) > 0.5 ? C.cream : '#F2C94C', x, 4, 6, 7);
    },
  },
  'furn/bench': {
    up: 2,
    down: 0,
    paint: (c) => {
      rect(c, C.wallTrimDark, 1, 6, 14, 8);
      rect(c, C.wallTrim, 1, 4, 14, 4);
    },
  },
  'furn/arcade': {
    up: 12,
    down: 0,
    paint: (c, w, h) => {
      rect(c, '#5A3A7A', 3, -10, w - 6, h + 10);
      rect(c, '#1B1430', 6, -7, w - 12, 12);
      for (let y = -6; y < 4; y += 3) rect(c, y % 2 ? '#F2C94C' : '#4FE38B', 8, y, w - 16, 1);
      rect(c, '#F2685A', 8, 9, 3, 3);
      rect(c, '#4A7BD0', w - 13, 9, 3, 3);
    },
  },
  'furn/pingpong': {
    up: 0,
    down: 0,
    paint: (c, w, h) => {
      tabletop(c, w, h, C.leafDeep, C.leaf);
      rect(c, C.cream, 2, 1, w - 4, 1);
      rect(c, C.cream, Math.floor(w / 2), 0, 1, h - 8);
      rect(c, C.cream, Math.floor(w / 2) - 1, 2, 3, 1);
    },
  },
  'flat/sofa': { up: 0, down: 0, paint: (c, w, h) => sofa(c, w, h) },
  'flat/pet-bed': {
    up: 0,
    down: 0,
    paint: (c) => {
      disc(c, '#B07F2C', 8, 8, 6);
      disc(c, '#EBC873', 8, 8, 4);
    },
  },
  'flat/hammock': {
    up: 6,
    down: 0,
    paint: (c, w) => {
      rect(c, C.wallTrimDark, 0, -4, 2, 14);
      rect(c, C.wallTrimDark, w - 2, -4, 2, 14);
      for (let x = 2; x < w - 2; x++) {
        const sag = Math.round(Math.sin(((x - 2) / (w - 4)) * Math.PI) * 4);
        rect(c, Math.floor(x / 3) % 2 ? C.terracottaLight : C.cream, x, 2 + sag, 1, 4);
      }
    },
  },
  'flat/pouf': {
    up: 0,
    down: 0,
    paint: (c) => {
      disc(c, C.terracotta, 8, 9, 6);
      disc(c, C.terracottaLight, 8, 7, 5);
    },
  },
  'face/logo': {
    up: 0,
    down: 0,
    paint: (c, w, h) => {
      rect(c, C.wallTrimDark, 0, 2, w, h - 8);
      rect(c, C.ink, 2, 4, w - 4, h - 12);
      rect(c, '#EDBE45', 6, 8, w - 12, 2);
      rect(c, C.cream, 10, 13, w - 20, 2);
    },
  },
  'face/board-projects': { up: 0, down: 0, paint: boardPainter('#26323F', '#5FC9B8') },
  'face/project-board': { up: 0, down: 0, paint: boardPainter('#C99B66', '#F6EBDD') },
  'face/tv': { up: 0, down: 0, paint: boardPainter('#1B2430', '#4A7BD0', true) },
  'face/screens': {
    up: 0,
    down: 0,
    paint: (c, w, h) => {
      for (let x = 2; x + 14 <= w; x += 16) {
        rect(c, '#1B2430', x, 3, 14, h - 10);
        rect(c, C.socScreen, x + 1, 4, 12, h - 12);
        for (let y = 6; y < h - 10; y += 3) rect(c, '#1E7F4A', x + 2, y, 8 - (y % 4), 1);
      }
    },
  },
  'face/lock': {
    up: 0,
    down: 0,
    paint: (c, w, h) => {
      rect(c, C.mustard, 8, 12, w - 16, h - 18);
      rect(c, '#EDBE45', 8, 12, w - 16, 2);
      disc(c, '#B5B5B5', w / 2, 10, 8);
      disc(c, C.socFloor, w / 2, 11, 5);
      rect(c, C.socFloor, w / 2 - 2, 14, 4, 4);
    },
  },
  'face/shelf': {
    up: 0,
    down: 0,
    paint: (c, w, h) => {
      rect(c, C.wallTrimDark, 1, 2, w - 2, h - 8);
      bookRows(c, 2, 3, w - 4, h - 10, 6);
    },
  },
  'face/fridge': {
    up: 0,
    down: 0,
    paint: (c, w, h) => {
      rect(c, '#DDE6EA', 2, 2, w - 4, h - 7);
      rect(c, '#9AA8B0', 2, 14, w - 4, 1);
      rect(c, '#5E6470', w - 6, 6, 1, 6);
    },
  },
  'face/vending': {
    up: 0,
    down: 0,
    paint: (c, w, h) => {
      rect(c, C.terracotta, 2, 2, w - 4, h - 7);
      rect(c, '#1B2430', 4, 4, w - 12, h - 12);
      for (let y = 6; y < h - 10; y += 6) rect(c, '#F2C94C', 6, y, w - 16, 2);
    },
  },
  'face/postits': {
    up: 0,
    down: 0,
    paint: (c, w, h) => {
      const colors = ['#F2C94C', '#F5A3B8', '#9FE8C0'];
      for (let y = 4; y + 6 <= h - 8; y += 8)
        for (let x = 3; x + 7 <= w - 3; x += 9)
          rect(c, colors[Math.floor(hash2(x, y, 4) * 3)] as string, x, y, 6, 6);
    },
  },
  'face/whiteboard': { up: 0, down: 0, paint: boardPainter('#F6EBDD', '#4A7BD0') },
  'face/diagram': {
    up: 0,
    down: 0,
    paint: (c, w, h) => {
      rect(c, C.wallTrimDark, 1, 2, w - 2, h - 7);
      rect(c, C.cream, 2, 3, w - 4, h - 9);
      rect(c, C.teal, 6, 7, 10, 6);
      rect(c, C.terracotta, w - 18, 7, 10, 6);
      rect(c, C.ink, 16, 9, w - 34, 1);
    },
  },
  'face/palette': {
    up: 0,
    down: 0,
    paint: (c, w, h) => {
      rect(c, C.wallTrimDark, 1, 2, w - 2, h - 7);
      const cols = [C.teal, C.terracotta, C.mustard, C.plum, C.leaf, '#4A7BD0'];
      cols.forEach((col, i) =>
        rect(c, col, 4 + i * Math.floor((w - 8) / 6), 6, Math.floor((w - 8) / 6) - 1, h - 14),
      );
    },
  },
  'face/electric': {
    up: 0,
    down: 0,
    paint: (c, w, h) => {
      rect(c, '#5E6470', 2, 3, w - 4, h - 8);
      rect(c, '#8A8A92', 3, 4, w - 6, h - 10);
      for (let x = 6; x < w - 8; x += 7) {
        rect(c, '#26323F', x, 8, 4, 8);
        px(c, hash2(x, 1, 3) > 0.5 ? '#F2685A' : '#4FE38B', x + 1, 6);
      }
    },
  },
  'face/rack': { up: 0, down: 0, paint: (c, w, h) => ledRack(c, w, h - 4, 7) },
  'face/lights-terrace': {
    up: 0,
    down: 0,
    paint: (c, w) => {
      for (let x = 1; x < w; x += 4)
        px(
          c,
          ['#F2C94C', '#F2685A', '#4FE38B'][Math.floor(hash2(x, 1, 1) * 3)] as string,
          x,
          2 + (x % 8 === 1 ? 2 : 0),
        );
    },
  },
};

function boardPainter(frame: string, content: string, screen = false): Layout['paint'] {
  return (c, w, h) => {
    rect(c, C.wallTrimDark, 1, 2, w - 2, h - 7);
    rect(c, frame, 2, 3, w - 4, h - 9);
    if (screen) rect(c, '#2F3F50', 3, 4, w - 6, h - 11);
    for (let y = 6; y < h - 8; y += 5) {
      rect(c, content, 5, y, Math.max(4, w - 12 - ((y * 7) % 14)), 2);
    }
  };
}

function normaliseName(name: string): { base: string; w?: number; h?: number; arg?: string } {
  const [pathAndArg, size] = name.split('@');
  const [base, arg] = (pathAndArg ?? '').split(':');
  if (size) {
    const m = /^(\d+)x(\d+)$/.exec(size);
    if (m) return { base: base as string, w: Number(m[1]), h: Number(m[2]), arg };
  }
  return { base: base as string, arg };
}

/** True when the built-in art can paint `name` (no canvas needed: usable in tests). */
export function isKnownFurniture(name: string): boolean {
  const { base } = normaliseName(name);
  return base in LAYOUTS || base.startsWith('rug/') || base.startsWith('window/');
}

/** Paints `name` (optionally `name@WxH`, in tiles) or returns undefined for unknown names. */
export function paintFurniture(name: string, defaultW = 1, defaultH = 1): FurnitureArt | undefined {
  const { base, w: tw, h: th, arg } = normaliseName(name);
  const wTiles = tw ?? defaultW;
  const hTiles = th ?? defaultH;
  const W = wTiles * 16;
  const H = hTiles * 16;

  let layout: Layout | undefined = LAYOUTS[base];
  if (!layout && base.startsWith('rug/')) {
    const color = RUG_COLORS[base.slice(4)] ?? C.teal;
    layout = { up: 0, down: 0, paint: (c, w, h) => rug(c, w, h, color) };
  }
  if (!layout && base.startsWith('window/')) {
    const view = base.slice(7);
    const phase = (arg ?? 'day') as keyof typeof SKY;
    layout = {
      up: 0,
      down: 0,
      paint: (c, w, h) => windowArt(c, w, h, view, SKY[phase] ?? SKY.day, phase === 'night'),
    };
  }
  if (!layout) return undefined;

  const surface = createSurface(W + PAD * 2, H + layout.up + layout.down + PAD * 2);
  surface.ctx.save();
  surface.ctx.translate(PAD, PAD + layout.up);
  layout.paint(surface.ctx, W, H);
  surface.ctx.restore();
  addOutline(surface, C.outline);
  return { surface, ax: PAD, ay: PAD + layout.up };
}
