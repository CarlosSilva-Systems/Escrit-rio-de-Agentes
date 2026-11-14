// Credits shown in the Credits screen (CA-05). Mirrors CREDITS.md / NOTICE.md (those are the
// authoritative lists). Names, authors and licenses are proper nouns, so they are not translated;
// only the status label goes through i18n.

export type CreditStatus = 'base' | 'in-use' | 'planned';

import type { MessageKey } from '../../i18n/i18n';

export interface CreditEntry {
  /** Proper name, shown as is. */
  name?: string;
  /** Descriptive item, translated. */
  nameKey?: MessageKey;
  author: string;
  license: string;
  url?: string;
  status: CreditStatus;
}

export const CREDITS: readonly CreditEntry[] = [
  {
    name: 'Pixel Agents',
    author: 'Pablo De Lucca',
    license: 'MIT',
    url: 'https://github.com/pablodelucca/pixel-agents',
    status: 'base',
  },
  {
    nameKey: 'credits.entry.placeholder-art',
    author: 'Escritório da Equipe',
    license: 'MIT',
    status: 'in-use',
  },
  {
    name: 'Pixelify Sans',
    author: 'The Pixelify Sans Project Authors',
    license: 'OFL 1.1',
    url: 'https://github.com/eifetx/Pixelify-Sans',
    status: 'in-use',
  },
  {
    name: 'Silkscreen',
    author: 'The Silkscreen Project Authors',
    license: 'OFL 1.1',
    url: 'https://github.com/googlefonts/silkscreen',
    status: 'in-use',
  },
];
