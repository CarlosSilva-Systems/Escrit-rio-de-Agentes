// Status icons (GUIA-VISUAL §6): 8x8 art + 1 px outline = 10x10, drawn from the ASCII sketches.

import { addOutline, createSurface, paintAscii, type Surface } from './pixel';
import { C } from './palette';

export const ICON_SIZE = 10;
export type IconName = 'gear' | 'cup' | 'zzz' | 'alert' | 'attention' | 'plim';

const ICONS: Record<IconName, { rows: string[]; legend: Record<string, string> }> = {
  gear: {
    rows: [
      '..#..#..',
      '.######.',
      '.##..##.',
      '###..###',
      '###..###',
      '.##..##.',
      '.######.',
      '..#..#..',
    ],
    legend: { '#': '#78B0F5' },
  },
  cup: {
    rows: [
      '.#..#...',
      '..#..#..',
      '.#####..',
      '.#ccc###',
      '.#ccc#.#',
      '.#ccc###',
      '..###...',
      '.#####..',
    ],
    legend: { '#': '#F6EBDD', c: '#C8643F' },
  },
  zzz: {
    rows: [
      '######..',
      '...##...',
      '..##....',
      '######..',
      '.....###',
      '......#.',
      '.....#..',
      '.....###',
    ],
    legend: { '#': '#BCA3EE' },
  },
  alert: {
    rows: [
      '...##...',
      '...##...',
      '...##...',
      '...##...',
      '...##...',
      '........',
      '...##...',
      '...##...',
    ],
    legend: { '#': '#F2685A' },
  },
  attention: {
    rows: [
      '...##...',
      '...##...',
      '..####..',
      '..#cc#..',
      '.##cc##.',
      '.#cccc#.',
      '########',
      '........',
    ],
    legend: { '#': '#F2C94C', c: '#3B2A20' },
  },
  plim: {
    rows: [
      '...##...',
      '...##...',
      '..####..',
      '########',
      '########',
      '..####..',
      '...##...',
      '...##...',
    ],
    legend: { '#': '#FFD84D' },
  },
};

export function paintIcon(name: IconName): Surface {
  const surface = createSurface(ICON_SIZE, ICON_SIZE);
  const def = ICONS[name];
  paintAscii(surface.ctx, def.rows, def.legend, 1, 1);
  addOutline(surface, C.outline);
  return surface;
}

export const ICON_NAMES = Object.keys(ICONS) as IconName[];
