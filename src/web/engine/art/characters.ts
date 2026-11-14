// Provisional character art, drawn in code from the visual sheets in PERSONAGENS.md (skin, hair,
// clothes, accessory, department badge). Same sheet layout as the production art will use
// (14 columns x 5 rows of 16x32 cells, W is the mirror of E), so real sprites can replace this
// without touching the engine.

import { DEPARTMENT_COLORS, C } from './palette';
import { addOutline, createSurface, px, rect, type PixelContext, type Surface } from './pixel';

export type Dir = 's' | 'n' | 'e';
export type Anim = 'walk' | 'idle' | 'sit' | 'type' | 'read';

export const CELL_W = 16;
export const CELL_H = 32;
export const SHEET_COLS = 14;
export const SHEET_ROWS = 5;

type HairStyle =
  'short' | 'bun' | 'ponytail' | 'bald' | 'curly' | 'spiky' | 'hood' | 'braids' | 'wavy';
type TopStyle =
  | 'tee'
  | 'blazer'
  | 'cardigan'
  | 'hoodie'
  | 'vest'
  | 'labcoat'
  | 'suspenders'
  | 'shawl'
  | 'jacket'
  | 'suit'
  | 'overalls';

export interface CharacterSpec {
  /** Sprite id from escritorio.json (`npc-livia`). */
  key: string;
  department?: keyof typeof DEPARTMENT_COLORS;
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  beard?: 'full' | 'stubble' | 'mustache';
  eyewear?: 'round' | 'big' | 'shades' | 'half';
  headgear?: 'goggles' | 'headphones' | 'headset' | 'pen';
  top: TopStyle;
  r1: string;
  r2: string;
  pants: string;
  shoes: string;
  /** Accent for vests/stripes. */
  accent?: string;
  held?: 'tube' | 'mug' | 'lupa' | 'tablet' | 'book';
  /** Visitor badge instead of a department badge. */
  visitor?: boolean;
  /** Bigger gold badge (the Director). */
  bigBadge?: boolean;
}

const SKIN = {
  s1: '#F5D0B0',
  s2: '#E3B48A',
  s3: '#C68B59',
  s4: '#9A6240',
  s5: '#6B4226',
  s6: '#4A2C1A',
};

// 16 fixed team members (PERSONAGENS.md §2, in the order of escritorio.json).
export const TEAM_SPECS: CharacterSpec[] = [
  {
    key: 'npc-chefe',
    department: 'diretoria',
    skin: SKIN.s3,
    hair: '#3A3A40',
    hairStyle: 'short',
    top: 'blazer',
    r1: '#2C3E66',
    r2: '#F3E6CC',
    pants: '#5B5B66',
    shoes: '#4A3326',
    held: 'tablet',
    bigBadge: true,
  },
  {
    key: 'npc-alice',
    department: 'planejamento',
    skin: SKIN.s2,
    hair: '#1F1A22',
    hairStyle: 'short',
    top: 'cardigan',
    r1: '#D9A441',
    r2: '#F6EBDD',
    pants: '#4B6585',
    shoes: '#F6EBDD',
  },
  {
    key: 'npc-artur',
    department: 'planejamento',
    skin: SKIN.s1,
    hair: '#9A9A9A',
    hairStyle: 'short',
    beard: 'stubble',
    top: 'vest',
    r1: '#5E6470',
    r2: '#8FB4D9',
    pants: '#B59A73',
    shoes: '#4A3326',
    held: 'tube',
  },
  {
    key: 'npc-bianca',
    department: 'planejamento',
    skin: SKIN.s4,
    hair: '#2B1B14',
    hairStyle: 'bun',
    headgear: 'pen',
    top: 'overalls',
    r1: '#C8643F',
    r2: '#F3E6CC',
    pants: '#C8643F',
    shoes: '#4FB3A5',
    held: 'tablet',
  },
  {
    key: 'npc-livia',
    department: 'engenharia',
    skin: SKIN.s1,
    hair: '#A8512B',
    hairStyle: 'ponytail',
    headgear: 'headphones',
    top: 'hoodie',
    r1: '#2F5E73',
    r2: '#F6EBDD',
    pants: '#2A2A30',
    shoes: '#F6EBDD',
  },
  {
    key: 'npc-bruno',
    department: 'engenharia',
    skin: SKIN.s5,
    hair: '#1A1410',
    hairStyle: 'bald',
    beard: 'full',
    headgear: 'headset',
    top: 'jacket',
    r1: '#4B6585',
    r2: '#8A8A92',
    pants: '#2A2A30',
    shoes: '#2A2320',
  },
  {
    key: 'npc-otavio',
    department: 'engenharia',
    skin: SKIN.s2,
    hair: '#5A3A28',
    hairStyle: 'short',
    beard: 'stubble',
    top: 'tee',
    r1: '#6C7A89',
    r2: '#6C7A89',
    pants: '#B59A73',
    shoes: '#4A3326',
    held: 'mug',
  },
  {
    key: 'npc-eduardo',
    department: 'engenharia',
    skin: SKIN.s3,
    hair: '#1F1A17',
    hairStyle: 'spiky',
    headgear: 'goggles',
    top: 'labcoat',
    r1: '#F6EBDD',
    r2: '#2A2A30',
    pants: '#5E6470',
    shoes: '#2A2320',
  },
  {
    key: 'npc-rafael',
    department: 'engenharia',
    skin: SKIN.s4,
    hair: '#8A8A8A',
    hairStyle: 'short',
    beard: 'mustache',
    top: 'vest',
    r1: '#D7E23B',
    r2: '#8A8A92',
    pants: '#2C3E66',
    shoes: '#4A3326',
    accent: '#D4C3B0',
  },
  {
    key: 'npc-teresa',
    department: 'qualidade',
    skin: SKIN.s3,
    hair: '#3A2418',
    hairStyle: 'curly',
    top: 'cardigan',
    r1: '#3E7A5A',
    r2: '#F6EBDD',
    pants: '#4B6585',
    shoes: '#F6EBDD',
    held: 'lupa',
  },
  {
    key: 'npc-rita',
    department: 'qualidade',
    skin: SKIN.s1,
    hair: '#B5B5B5',
    hairStyle: 'short',
    eyewear: 'big',
    top: 'tee',
    r1: '#4FB3A5',
    r2: '#F3E6CC',
    pants: '#5E6470',
    shoes: '#4A3326',
    accent: '#F3E6CC',
  },
  {
    key: 'npc-sergio',
    department: 'qualidade',
    skin: SKIN.s6,
    hair: '#1A1410',
    hairStyle: 'bald',
    beard: 'full',
    eyewear: 'shades',
    top: 'suit',
    r1: '#24262C',
    r2: '#44506A',
    pants: '#24262C',
    shoes: '#1A1410',
  },
  {
    key: 'npc-pedro',
    department: 'qualidade',
    skin: SKIN.s2,
    hair: '#4A7BD0',
    hairStyle: 'hood',
    top: 'hoodie',
    r1: '#44506A',
    r2: '#F6EBDD',
    pants: '#2A2A30',
    shoes: '#8A8A92',
  },
  {
    key: 'npc-gabriela',
    department: 'entrega',
    skin: SKIN.s4,
    hair: '#1A1410',
    hairStyle: 'braids',
    top: 'jacket',
    r1: '#5B7FA6',
    r2: '#F3E6CC',
    pants: '#2A2A30',
    shoes: '#F6EBDD',
  },
  {
    key: 'npc-davi',
    department: 'entrega',
    skin: SKIN.s2,
    hair: '#8A6A3A',
    hairStyle: 'wavy',
    beard: 'stubble',
    top: 'suspenders',
    r1: '#F3E6CC',
    r2: '#7A4A2A',
    pants: '#5E6470',
    shoes: '#4A3326',
    held: 'book',
  },
  {
    key: 'npc-paula',
    department: 'biblioteca',
    skin: SKIN.s3,
    hair: '#CFCFD6',
    hairStyle: 'short',
    eyewear: 'half',
    top: 'shawl',
    r1: '#8E2F4B',
    r2: '#2F6B3A',
    pants: '#5E6470',
    shoes: '#4A3326',
    held: 'book',
  },
];

/** Freelancer: neutral outfit, three sorted skin/hair variations (PERSONAGENS.md §3). */
export const FREELANCER_SPECS: CharacterSpec[] = [
  { skin: SKIN.s1, hair: '#5A3A28' },
  { skin: SKIN.s4, hair: '#1A1410' },
  { skin: SKIN.s2, hair: '#A8512B' },
].map((v, i): CharacterSpec => ({
  key: i === 0 ? 'npc-freelancer' : `npc-freelancer-${i + 1}`,
  skin: v.skin,
  hair: v.hair,
  hairStyle: 'short',
  top: 'jacket',
  r1: '#B59A73',
  r2: '#D4C3B0',
  pants: '#5E6470',
  shoes: '#4A3326',
  visitor: true,
}));

export const ALL_SPECS: CharacterSpec[] = [...TEAM_SPECS, ...FREELANCER_SPECS];

// --- Sheet layout (PERSONAGENS.md §1.2) -------------------------------------------------------

interface Slot {
  anim: Anim;
  dir: Dir;
  frames: number;
  row: number;
  col: number;
}

export const SHEET_LAYOUT: readonly Slot[] = [
  { anim: 'walk', dir: 's', frames: 4, row: 0, col: 0 },
  { anim: 'walk', dir: 'n', frames: 4, row: 0, col: 4 },
  { anim: 'walk', dir: 'e', frames: 4, row: 0, col: 8 },
  { anim: 'idle', dir: 's', frames: 2, row: 1, col: 0 },
  { anim: 'idle', dir: 'n', frames: 2, row: 1, col: 2 },
  { anim: 'idle', dir: 'e', frames: 2, row: 1, col: 4 },
  { anim: 'sit', dir: 's', frames: 1, row: 1, col: 6 },
  { anim: 'sit', dir: 'n', frames: 1, row: 1, col: 7 },
  { anim: 'sit', dir: 'e', frames: 1, row: 1, col: 8 },
  { anim: 'type', dir: 's', frames: 2, row: 2, col: 0 },
  { anim: 'type', dir: 'n', frames: 2, row: 2, col: 2 },
  { anim: 'type', dir: 'e', frames: 2, row: 2, col: 4 },
  { anim: 'read', dir: 's', frames: 2, row: 2, col: 6 },
  { anim: 'read', dir: 'n', frames: 2, row: 2, col: 8 },
  { anim: 'read', dir: 'e', frames: 2, row: 2, col: 10 },
];

// --- Drawing ----------------------------------------------------------------------------------

function shadeHex(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v + amount)));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, '0')).join('')}`;
}

interface Pose {
  /** Upper-body vertical offset (bob / sitting). */
  ub: number;
  sitting: boolean;
  /** 0 = both legs planted, otherwise which leg is lifted (1 left/back, 2 right/front). */
  lift: 0 | 1 | 2;
  /** Arm vertical swing (-1, 0, +1): left arm gets `swing`, right arm gets `-swing`. */
  swing: number;
  /** Sitting hands (typing): which hand is raised. */
  typing: 0 | 1 | 2;
  reading: boolean;
  /** Side view stride: -1 back, 0 together, +1 front. */
  stride: number;
  holdItem: boolean;
}

function poseFor(anim: Anim, frame: number): Pose {
  const base: Pose = {
    ub: 0,
    sitting: false,
    lift: 0,
    swing: 0,
    typing: 0,
    reading: false,
    stride: 0,
    holdItem: false,
  };
  switch (anim) {
    case 'walk': {
      const lift = [0, 1, 0, 2][frame % 4] as 0 | 1 | 2;
      return {
        ...base,
        ub: lift ? 1 : 0,
        lift,
        swing: [0, 1, 0, -1][frame % 4] as number,
        stride: [0, 1, 0, -1][frame % 4] as number,
      };
    }
    case 'idle':
      return { ...base, ub: frame % 2, holdItem: true };
    case 'sit':
      return { ...base, ub: 3, sitting: true };
    case 'type':
      return { ...base, ub: 3, sitting: true, typing: frame % 2 === 0 ? 1 : 2 };
    case 'read':
      return { ...base, ub: 3, sitting: true, reading: true };
  }
}

function drawLegs(
  ctx: PixelContext,
  o: { x: number; y: number },
  spec: CharacterSpec,
  dir: Dir,
  pose: Pose,
): void {
  const { x, y } = o;
  const pantsDark = shadeHex(spec.pants, -22);
  if (pose.sitting) {
    if (dir === 'n') {
      rect(ctx, spec.pants, x + 4, y + 27, 8, 2);
      return;
    }
    if (dir === 's') {
      rect(ctx, spec.pants, x + 4, y + 26, 8, 3);
      rect(ctx, pantsDark, x + 7, y + 26, 1, 3);
      rect(ctx, spec.shoes, x + 4, y + 29, 4, 2);
      rect(ctx, spec.shoes, x + 8, y + 29, 4, 2);
    } else {
      rect(ctx, spec.pants, x + 6, y + 26, 7, 3);
      rect(ctx, spec.shoes, x + 11, y + 28, 3, 3);
    }
    return;
  }
  const lowL = pose.lift === 1 ? 1 : 0;
  const lowR = pose.lift === 2 ? 1 : 0;
  if (dir === 'e') {
    const back = pose.stride * -2;
    const front = pose.stride * 2;
    // back leg
    rect(ctx, spec.pants, x + 6 + back, y + 24, 2, 5 - lowL);
    rect(ctx, spec.shoes, x + 6 + back, y + 29 - lowL, 3, 2);
    // front leg
    rect(ctx, pantsDark, x + 8 + front, y + 24, 2, 5 - lowR);
    rect(ctx, spec.shoes, x + 8 + front, y + 29 - lowR, 3, 2);
    return;
  }
  rect(ctx, spec.pants, x + 4, y + 24, 4, 5 - lowL);
  rect(ctx, spec.pants, x + 8, y + 24, 4, 5 - lowR);
  rect(ctx, pantsDark, x + 7, y + 25, 1, 4 - Math.max(lowL, lowR));
  rect(ctx, spec.shoes, x + 4, y + 29 - lowL, 4, 2);
  rect(ctx, spec.shoes, x + 8, y + 29 - lowR, 4, 2);
}

function drawHead(
  ctx: PixelContext,
  o: { x: number; y: number },
  spec: CharacterSpec,
  dir: Dir,
  ub: number,
): void {
  const { x } = o;
  const y = o.y + ub;
  const skinShade = shadeHex(spec.skin, -24);
  const hair = spec.hair;
  const hairLight = shadeHex(hair, 22);
  const hood = spec.hairStyle === 'hood';
  const hoodColor = spec.r1;

  const face = () => {
    if (dir === 'e') {
      rect(ctx, spec.skin, x + 5, y + 6, 7, 8);
      px(ctx, spec.skin, x + 12, y + 10); // nose
      px(ctx, '#2A2320', x + 10, y + 9);
      rect(ctx, skinShade, x + 7, y + 9, 1, 2); // ear
      rect(ctx, skinShade, x + 9, y + 12, 2, 1);
    } else {
      rect(ctx, spec.skin, x + 4, y + 6, 8, 8);
      px(ctx, '#2A2320', x + 6, y + 9);
      px(ctx, '#2A2320', x + 9, y + 9);
      rect(ctx, skinShade, x + 7, y + 12, 2, 1);
    }
    rect(ctx, skinShade, x + 7, y + 14, 2, 1); // neck
  };

  if (dir === 'n') {
    rect(ctx, spec.skin, x + 4, y + 6, 8, 8);
    rect(ctx, skinShade, x + 7, y + 14, 2, 1);
    const back = hood ? hoodColor : hair;
    rect(ctx, back, x + 4, y + 3, 8, 11);
    rect(ctx, back, x + 5, y + 2, 6, 1);
    rect(ctx, hood ? shadeHex(hoodColor, -18) : hairLight, x + 6, y + 4, 2, 1);
    if (spec.hairStyle === 'bun') rect(ctx, hair, x + 6, y, 4, 3);
    if (spec.hairStyle === 'ponytail') rect(ctx, hair, x + 7, y + 14, 2, 6);
    if (spec.hairStyle === 'braids') {
      rect(ctx, hair, x + 3, y + 7, 1, 10);
      rect(ctx, hair, x + 12, y + 7, 1, 10);
    }
    if (spec.hairStyle === 'bald') rect(ctx, spec.skin, x + 5, y + 4, 6, 8);
    if (spec.headgear === 'headphones') {
      rect(ctx, '#2A2A30', x + 4, y + 2, 8, 1);
      rect(ctx, '#2A2A30', x + 3, y + 7, 1, 4);
      rect(ctx, '#2A2A30', x + 12, y + 7, 1, 4);
    }
    return;
  }

  face();
  // Hair / hood
  switch (spec.hairStyle) {
    case 'bald':
      rect(ctx, spec.skin, x + 5, y + 4, 6, 2);
      px(ctx, shadeHex(spec.skin, 30), x + 7, y + 4);
      break;
    case 'hood': {
      const dark = shadeHex(hoodColor, -20);
      if (dir === 'e') {
        rect(ctx, hoodColor, x + 4, y + 2, 8, 12);
        rect(ctx, spec.skin, x + 8, y + 7, 4, 6);
        px(ctx, spec.skin, x + 12, y + 10);
        px(ctx, '#2A2320', x + 10, y + 9);
        rect(ctx, dark, x + 4, y + 3, 1, 10);
      } else {
        rect(ctx, hoodColor, x + 3, y + 2, 10, 4);
        rect(ctx, hoodColor, x + 3, y + 6, 2, 8);
        rect(ctx, hoodColor, x + 11, y + 6, 2, 8);
        rect(ctx, dark, x + 5, y + 6, 6, 1);
        px(ctx, hair, x + 6, y + 6); // blue lock escaping the hood
        px(ctx, hair, x + 6, y + 7);
      }
      break;
    }
    case 'curly':
      rect(ctx, hair, x + 3, y + 3, 10, 5);
      rect(ctx, hair, x + 4, y + 2, 8, 1);
      rect(ctx, hair, x + 3, y + 8, 2, 3);
      rect(ctx, hair, x + 11, y + 8, 2, 3);
      px(ctx, hairLight, x + 6, y + 4);
      px(ctx, hairLight, x + 10, y + 5);
      break;
    case 'spiky':
      rect(ctx, hair, x + 4, y + 3, 8, 4);
      for (const sx of [5, 7, 9, 10]) rect(ctx, hair, x + sx, y + 1, 1, 2);
      break;
    default:
      rect(ctx, hair, x + 4, y + 3, 8, 4);
      rect(ctx, hair, x + 5, y + 2, 6, 1);
      rect(ctx, hair, x + 4, y + 7, 1, 2);
      if (dir !== 'e') rect(ctx, hair, x + 11, y + 7, 1, 2);
      px(ctx, hairLight, x + 6, y + 3);
  }
  if (dir === 'e' && spec.hairStyle !== 'hood' && spec.hairStyle !== 'bald')
    rect(ctx, hair, x + 5, y + 5, 3, 5);
  if (spec.hairStyle === 'bun') {
    rect(ctx, hair, x + 6, y, 4, 3);
    px(ctx, hairLight, x + 7, y);
  }
  if (spec.hairStyle === 'ponytail') {
    if (dir === 'e') rect(ctx, hair, x + 3, y + 6, 2, 8);
    else {
      rect(ctx, hair, x + 12, y + 7, 1, 4);
      rect(ctx, hair, x + 3, y + 7, 1, 2);
    }
  }
  if (spec.hairStyle === 'braids') {
    const braid = (bx: number) => {
      for (let i = 0; i < 9; i++) px(ctx, i % 2 ? hair : hairLight, x + bx, y + 7 + i);
    };
    if (dir === 'e') braid(4);
    else {
      braid(3);
      braid(12);
    }
  }
  if (spec.hairStyle === 'wavy') {
    rect(ctx, hair, x + 3, y + 5, 1, 5);
    if (dir !== 'e') rect(ctx, hair, x + 12, y + 5, 1, 5);
  }
  // Facial hair
  if (spec.beard === 'full') {
    if (dir === 'e') rect(ctx, hair, x + 8, y + 11, 4, 3);
    else {
      rect(ctx, hair, x + 5, y + 11, 6, 3);
      rect(ctx, hair, x + 4, y + 9, 1, 4);
      rect(ctx, hair, x + 11, y + 9, 1, 4);
      rect(ctx, shadeHex(spec.skin, -24), x + 7, y + 12, 2, 1);
    }
  } else if (spec.beard === 'stubble') {
    const s = shadeHex(spec.skin, -34);
    if (dir === 'e') rect(ctx, s, x + 8, y + 12, 3, 2);
    else rect(ctx, s, x + 5, y + 12, 6, 2);
  } else if (spec.beard === 'mustache') {
    if (dir === 'e') rect(ctx, hair, x + 9, y + 11, 3, 1);
    else rect(ctx, hair, x + 6, y + 11, 4, 1);
  }
  // Eyewear
  const frame = spec.eyewear === 'big' ? C.terracotta : '#2A2320';
  if (spec.eyewear === 'shades') {
    if (dir === 'e') rect(ctx, '#1A1410', x + 8, y + 8, 4, 3);
    else rect(ctx, '#1A1410', x + 5, y + 8, 6, 3);
  } else if (spec.eyewear === 'big') {
    if (dir === 'e') {
      rect(ctx, frame, x + 8, y + 7, 4, 4);
      rect(ctx, spec.skin, x + 9, y + 8, 2, 2);
    } else {
      rect(ctx, frame, x + 4, y + 7, 4, 4);
      rect(ctx, frame, x + 8, y + 7, 4, 4);
      rect(ctx, spec.skin, x + 5, y + 8, 2, 2);
      rect(ctx, spec.skin, x + 9, y + 8, 2, 2);
      px(ctx, '#2A2320', x + 6, y + 9);
      px(ctx, '#2A2320', x + 9, y + 9);
    }
  } else if (spec.eyewear === 'half') {
    if (dir === 'e') rect(ctx, '#CFCFD6', x + 9, y + 10, 3, 1);
    else {
      rect(ctx, '#CFCFD6', x + 5, y + 10, 3, 1);
      rect(ctx, '#CFCFD6', x + 9, y + 10, 3, 1);
    }
  }
  // Head gear
  if (spec.headgear === 'goggles') {
    rect(ctx, '#8A8A92', x + 4, y + 5, 8, 1);
    if (dir === 'e') rect(ctx, '#9FD8E8', x + 8, y + 4, 4, 2);
    else {
      rect(ctx, '#9FD8E8', x + 5, y + 4, 3, 2);
      rect(ctx, '#9FD8E8', x + 9, y + 4, 3, 2);
    }
  } else if (spec.headgear === 'headphones') {
    rect(ctx, '#E8E0D4', x + 4, y + 2, 8, 1);
    rect(ctx, '#2A2A30', x + (dir === 'e' ? 6 : 3), y + 7, 2, 4);
    if (dir !== 'e') rect(ctx, '#2A2A30', x + 11, y + 7, 2, 4);
  } else if (spec.headgear === 'headset') {
    rect(ctx, '#2A2A30', x + (dir === 'e' ? 6 : 11), y + 7, 2, 4);
    rect(ctx, '#2A2A30', x + (dir === 'e' ? 8 : 10), y + 11, 1, 2);
  } else if (spec.headgear === 'pen') {
    rect(ctx, C.teal, x + 10, y + 0, 1, 5);
    px(ctx, C.cream, x + 10, y + 0);
  }
}

function drawTorso(
  ctx: PixelContext,
  o: { x: number; y: number },
  spec: CharacterSpec,
  dir: Dir,
  pose: Pose,
): void {
  const { x } = o;
  const y = o.y + pose.ub;
  const side = dir === 'e';
  const bx = side ? 5 : 4;
  const bw = side ? 6 : 8;
  const sleeveColor =
    spec.top === 'vest' || spec.top === 'overalls' || spec.top === 'shawl' ? spec.r2 : spec.r1;
  const dark = shadeHex(spec.r1, -24);
  const long = spec.top === 'labcoat' ? 3 : 0;

  // Torso base
  rect(ctx, spec.r1, x + bx, y + 15, bw, 9 + long);
  rect(ctx, dark, x + bx, y + 23 + long, bw, 1);

  // Style details (front/side only; back view keeps a plain torso)
  if (dir !== 'n') {
    switch (spec.top) {
      case 'blazer':
      case 'suit':
        if (!side) {
          rect(ctx, spec.r2, x + 7, y + 15, 2, 5);
          px(ctx, spec.r2, x + 6, y + 15);
          px(ctx, spec.r2, x + 9, y + 15);
          rect(ctx, dark, x + 6, y + 16, 1, 4);
          rect(ctx, dark, x + 9, y + 16, 1, 4);
          if (spec.top === 'blazer') px(ctx, C.terracotta, x + 10, y + 19); // pocket square
        } else rect(ctx, spec.r2, x + 9, y + 15, 2, 5);
        break;
      case 'cardigan':
        if (!side) rect(ctx, spec.r2, x + 7, y + 15, 2, 9);
        else rect(ctx, spec.r2, x + 9, y + 15, 2, 9);
        rect(ctx, dark, x + (side ? 8 : 6), y + 15, 1, 9);
        break;
      case 'hoodie':
        rect(ctx, spec.r1, x + bx + 1, y + 14, bw - 2, 1);
        rect(ctx, dark, x + bx + 1, y + 20, bw - 2, 3);
        if (!side) {
          px(ctx, spec.r2, x + 7, y + 16);
          px(ctx, spec.r2, x + 9, y + 16);
        }
        break;
      case 'vest':
        rect(ctx, spec.r2, x + bx, y + 15, 1, 8);
        if (!side) rect(ctx, spec.r2, x + bx + bw - 1, y + 15, 1, 8);
        if (spec.accent) {
          rect(ctx, spec.accent, x + bx, y + 18, bw, 1);
          rect(ctx, spec.accent, x + bx, y + 21, bw, 1);
        }
        break;
      case 'labcoat':
        if (!side) {
          rect(ctx, spec.r2, x + 7, y + 15, 2, 5);
          rect(ctx, '#C9C0B2', x + 7, y + 20, 1, 6);
        }
        break;
      case 'suspenders':
        rect(ctx, spec.r2, x + bx + 1, y + 15, 1, 9);
        if (!side) rect(ctx, spec.r2, x + bx + bw - 2, y + 15, 1, 9);
        break;
      case 'shawl':
        rect(ctx, spec.r2, x + bx, y + 19, bw, 5);
        rect(ctx, spec.r1, x + bx - 1, y + 15, bw + 2, 4);
        rect(ctx, dark, x + bx + 2, y + 19, bw - 4, 1);
        break;
      case 'jacket':
        if (!side) rect(ctx, spec.r2, x + 7, y + 15, 2, 9);
        px(ctx, dark, x + bx + 1, y + 19);
        break;
      case 'overalls':
        rect(ctx, spec.r2, x + bx, y + 15, bw, 4);
        rect(ctx, spec.r1, x + bx + 1, y + 15, 1, 4);
        if (!side) rect(ctx, spec.r1, x + bx + bw - 2, y + 15, 1, 4);
        break;
      default:
        break;
    }
    // Badge
    const badgeColor = spec.visitor
      ? C.cream
      : (DEPARTMENT_COLORS[spec.department ?? '']?.light ?? C.cream);
    const [bw2, bh2] = spec.visitor ? [4, 3] : spec.bigBadge ? [3, 3] : [3, 2];
    const bxPos = side ? 8 : 9;
    rect(ctx, badgeColor, x + bxPos, y + 17, bw2, bh2);
    if (spec.visitor) rect(ctx, '#8A8A92', x + bxPos, y + 17, bw2, 1);
  } else {
    rect(ctx, '#5E6470', x + 7, y + 15, 1, 3); // lanyard
  }

  // Arms
  const swing = pose.swing;
  const armY = y + 15;
  const handColor = spec.skin;
  const reach = pose.sitting && dir !== 'n' ? 3 : 0;
  if (side) {
    const ax = 7 + (pose.sitting ? 0 : pose.stride);
    if (pose.sitting) {
      rect(ctx, sleeveColor, x + 8, armY + 2, 4, 2);
      rect(ctx, handColor, x + 12, armY + 2 + (pose.typing === 2 ? 1 : 0), 2, 2);
    } else {
      rect(ctx, sleeveColor, x + ax, armY, 2, 7);
      rect(ctx, handColor, x + ax, armY + 7, 2, 2);
    }
  } else if (pose.sitting) {
    const lY = pose.typing === 1 ? 1 : 0;
    const rY = pose.typing === 2 ? 1 : 0;
    rect(ctx, sleeveColor, x + 2, armY, 2, 7 + reach);
    rect(ctx, sleeveColor, x + 12, armY, 2, 7 + reach);
    if (dir === 's') {
      rect(ctx, handColor, x + 3, armY + 8 + reach + lY - 1, 2, 2);
      rect(ctx, handColor, x + 11, armY + 8 + reach + rY - 1, 2, 2);
    }
  } else {
    rect(ctx, sleeveColor, x + 2, armY + swing, 2, 7);
    rect(ctx, sleeveColor, x + 12, armY - swing, 2, 7);
    rect(ctx, handColor, x + 2, armY + 7 + swing, 2, 2);
    rect(ctx, handColor, x + 12, armY + 7 - swing, 2, 2);
  }

  // Held items / reading prop
  if (pose.reading && dir === 's') {
    rect(ctx, C.cream, x + 5, armY + 9, 6, 4);
    rect(ctx, C.wallCreamShade, x + 8, armY + 9, 1, 4);
  } else if (pose.reading && dir === 'e') {
    rect(ctx, C.cream, x + 11, armY + 5, 3, 5);
  } else if (pose.holdItem && spec.held && dir !== 'n') {
    const hx = side ? 11 : 13;
    switch (spec.held) {
      case 'mug':
        rect(ctx, '#6A3FA0', x + hx - 1, y + 20, 3, 3);
        break;
      case 'lupa':
        rect(ctx, '#C9962A', x + hx, y + 17, 1, 4);
        rect(ctx, '#9FD8E8', x + hx - 1, y + 14, 3, 3);
        rect(ctx, '#C9962A', x + hx - 2, y + 13, 5, 1);
        break;
      case 'tablet':
        rect(ctx, '#26323F', x + hx - 1, y + 18, 3, 5);
        px(ctx, '#9FD8E8', x + hx, y + 19);
        break;
      case 'book':
        rect(ctx, '#2F5E73', x + hx - 2, y + 19, 4, 5);
        rect(ctx, C.cream, x + hx - 2, y + 19, 1, 5);
        break;
      case 'tube':
        for (let i = 0; i < 9; i++) px(ctx, '#D4C3B0', x + 3 + i, y + 14 + i);
        for (let i = 0; i < 9; i++) px(ctx, '#B5A18C', x + 4 + i, y + 14 + i);
        px(ctx, C.terracotta, x + 12, y + 23);
        break;
    }
  }
}

/** Draws one cell (16x32) at (ox, oy): outline included, floor shadow added last. */
export function paintCharacterFrame(
  surface: Surface,
  ox: number,
  oy: number,
  spec: CharacterSpec,
  dir: Dir,
  anim: Anim,
  frame: number,
): void {
  const pose = poseFor(anim, frame);
  const { ctx } = surface;
  const o = { x: ox, y: oy };
  drawLegs(ctx, o, spec, dir, pose);
  drawTorso(ctx, o, spec, dir, pose);
  drawHead(ctx, o, spec, dir, pose.ub);
  addOutline(surface, C.outline, [ox, oy, CELL_W, CELL_H]);
  // Floor shadow (after the outline so it does not get one).
  ctx.fillStyle = C.shadow;
  ctx.fillRect(ox + 3, oy + 30, 10, 2);
  ctx.fillRect(ox + 4, oy + 32 - 1, 8, 1);
}

/** Full 14x5 sheet (224x160) for one character. */
export function paintCharacterSheet(spec: CharacterSpec): Surface {
  const surface = createSurface(SHEET_COLS * CELL_W, SHEET_ROWS * CELL_H);
  for (const slot of SHEET_LAYOUT) {
    for (let f = 0; f < slot.frames; f++) {
      paintCharacterFrame(
        surface,
        (slot.col + f) * CELL_W,
        slot.row * CELL_H,
        spec,
        slot.dir,
        slot.anim,
        f,
      );
    }
  }
  return surface;
}

/** 16x16 portrait (feed, kanban): idle S head, dark background, 1 px department frame. */
export function paintPortrait(sheet: Surface, spec: CharacterSpec): Surface {
  const out = createSurface(16, 16);
  const light = spec.visitor
    ? C.beige
    : (DEPARTMENT_COLORS[spec.department ?? '']?.light ?? C.beige);
  rect(out.ctx, light, 0, 0, 16, 16);
  rect(out.ctx, C.bg700, 1, 1, 14, 14);
  // Head region of the idle-S cell (rows 0..15 of the cell), scaled 1:1 and centred.
  out.ctx.drawImage(sheet.canvas as CanvasImageSource, 0, 0 + 1 * CELL_H + 1, 16, 15, 0, 1, 16, 15);
  rect(out.ctx, light, 0, 0, 16, 1);
  rect(out.ctx, light, 0, 15, 16, 1);
  rect(out.ctx, light, 0, 0, 1, 16);
  rect(out.ctx, light, 15, 0, 1, 16);
  return out;
}
