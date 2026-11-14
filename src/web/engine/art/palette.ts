// Colours of the in-code art, copied from docs/design/tokens.css (GUIA-VISUAL §2).

export const C = {
  outline: '#3B2A20',
  shadow: 'rgba(59, 42, 32, 0.25)',
  floorHoney: '#D9A566',
  floorHoneyDark: '#C98F52',
  floorHoneyLight: '#E8BB80',
  wallCream: '#F3E6CC',
  wallCreamShade: '#E2D0AE',
  wallTrim: '#B98C5A',
  wallTrimDark: '#8C6A47',
  teal: '#4FB3A5',
  tealDeep: '#2E7F76',
  terracotta: '#C8643F',
  terracottaLight: '#E08A5F',
  leaf: '#4E9A4F',
  leafDeep: '#2F6B3A',
  socFloor: '#26323F',
  socScreen: '#4FE38B',
  socBlue: '#4A7BD0',
  mustard: '#C9962A',
  plum: '#7C4A8A',
  ink: '#1F1A17',
  bg700: '#3A312C',
  cream: '#F6EBDD',
  beige: '#D4C3B0',
} as const;

/** Department colours: `light` (badge) and `base` (rugs, signs). Keys = escritorio.json ids. */
export const DEPARTMENT_COLORS: Record<string, { light: string; base: string }> = {
  diretoria: { light: '#EDBE45', base: '#C9962A' },
  planejamento: { light: '#BCA3EE', base: '#9A7DD6' },
  engenharia: { light: '#78B0F5', base: '#5B94E0' },
  qualidade: { light: '#6FCF7C', base: '#3E9B55' },
  entrega: { light: '#F59F45', base: '#E0792B' },
  biblioteca: { light: '#E58AA5', base: '#8E2F4B' },
};

export const SKY: Record<'dawn' | 'day' | 'dusk' | 'night', string> = {
  dawn: '#FFD8B0',
  day: '#BFE3F5',
  dusk: '#FFA36B',
  night: '#1B2748',
};
