/* Escritório da Equipe — tema Tailwind (equivalente a tokens.css). Exemplo de uso:
 *   // tailwind.config.js
 *   const office = require('./docs/design/tailwind.theme.cjs');
 *   module.exports = { theme: { extend: office } };
 * Valores: ver GUIA-VISUAL.md. Não editar aqui sem editar lá.
 */
module.exports = {
  colors: {
    bg: { 900: '#1F1A17', 800: '#2A2320', 700: '#3A312C', track: '#120F0D' },
    line: { soft: '#5A4A40', strong: '#94806E' },
    ink: '#1F1A17',
    text: { 1: '#F6EBDD', 2: '#D4C3B0', 3: '#B5A18C', disabled: '#8A7766' },
    teal: { 300: '#5FC9B8' },
    terra: { 300: '#E8896A' },
    focus: '#FFD84D',
    meter: { green: '#5FCB6E', yellow: '#F2C94C', red: '#F2685A' },
    danger: '#F77B6B',
    dept: {
      diretoria: { light: '#EDBE45', base: '#C9962A', on: '#1F1A17' },
      planejamento: { light: '#BCA3EE', base: '#9A7DD6', on: '#1F1A17' },
      engenharia: { light: '#78B0F5', base: '#5B94E0', on: '#1F1A17' },
      qualidade: { light: '#6FCF7C', base: '#3E9B55', on: '#1F1A17' },
      entrega: { light: '#F59F45', base: '#E0792B', on: '#1F1A17' },
      biblioteca: { light: '#E58AA5', base: '#8E2F4B', on: '#F6EBDD' },
    },
    art: {
      'floor-honey': '#D9A566', 'floor-honey-dark': '#C98F52', 'floor-honey-light': '#E8BB80',
      'wall-cream': '#F3E6CC', 'wall-cream-shade': '#E2D0AE', 'wall-trim': '#B98C5A',
      teal: '#4FB3A5', 'teal-deep': '#2E7F76', terracotta: '#C8643F', 'terracotta-light': '#E08A5F',
      leaf: '#4E9A4F', 'leaf-deep': '#2F6B3A', outline: '#3B2A20',
      'soc-floor': '#26323F', 'soc-screen': '#4FE38B', 'soc-blue': '#4A7BD0',
    },
  },
  spacing: {
    1: '4px', 2: '8px', 3: '12px', 4: '16px', 5: '20px', 6: '24px', 8: '32px', 10: '40px', 12: '48px', 16: '64px',
  },
  borderRadius: { none: '0', px1: '4px', px2: '8px' },
  boxShadow: {
    px1: '0 2px 0 0 #120F0D',
    px2: '0 4px 0 0 #120F0D',
    px3: '0 4px 0 0 #120F0D, 0 8px 0 0 rgba(18,15,13,0.5)',
    outline: '0 0 0 2px #94806E',
    focus: '0 0 0 2px #1F1A17, 0 0 0 4px #FFD84D',
  },
  zIndex: { map: '0', overlay: '10', minimap: '20', bottom: '30', drawer: '40', topbar: '50', popover: '60', modal: '70', toast: '80' },
  fontFamily: {
    ui: ['"Pixelify Sans"', 'ui-monospace', '"Cascadia Mono"', 'Consolas', 'monospace'],
    sign: ['Silkscreen', '"Pixelify Sans"', 'ui-monospace', 'monospace'],
    mono: ['"Cascadia Mono"', 'Consolas', '"Courier New"', 'monospace'],
  },
  fontSize: {
    sm: ['14px', '20px'], md: ['16px', '24px'], lg: ['20px', '28px'], xl: ['24px', '32px'], '2xl': ['32px', '40px'],
    'sign-sm': ['16px', '16px'], 'sign-md': ['24px', '24px'], 'sign-lg': ['32px', '32px'],
  },
  transitionDuration: { fast: '120ms', base: '160ms', slow: '240ms' },
  transitionTimingFunction: { pixel: 'steps(4, end)' },
};
