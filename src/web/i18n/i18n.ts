// i18n: `pt-BR.json` is the source of the keys; `en.json` must have exactly the same set (checked by
// i18n.test.ts, CA-10). Text coming from data (folder names, task titles) never goes through here.

import en from './en.json';
import ptBR from './pt-BR.json';

export type Lang = 'pt-BR' | 'en';
export const LANGS: readonly Lang[] = ['pt-BR', 'en'];
export const DEFAULT_LANG: Lang = 'pt-BR';

export type MessageKey = keyof typeof ptBR;
export type Params = Record<string, string | number>;

export const dictionaries: Record<Lang, Record<string, string>> = { 'pt-BR': ptBR, en };

export function isLang(value: unknown): value is Lang {
  return value === 'pt-BR' || value === 'en';
}

/** Looks a key up and fills `{name}` placeholders. Falls back to pt-BR, then to the key itself. */
export function translate(lang: Lang, key: MessageKey, params?: Params): string {
  const template = dictionaries[lang][key] ?? dictionaries[DEFAULT_LANG][key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = params[name];
    return value === undefined ? whole : String(value);
  });
}

/** Locale tag used by Intl for numbers and dates. */
export function intlLocale(lang: Lang): string {
  return lang;
}

const STORAGE_KEY = 'escritorio.lang';

/** First paint language: the saved choice, otherwise pt-BR (CA-10), never the browser language. */
export function readStoredLang(
  storage: Pick<Storage, 'getItem'> | undefined = safeStorage(),
): Lang {
  try {
    const stored = storage?.getItem(STORAGE_KEY);
    return isLang(stored) ? stored : DEFAULT_LANG;
  } catch {
    return DEFAULT_LANG;
  }
}

export function storeLang(
  lang: Lang,
  storage: Pick<Storage, 'setItem'> | undefined = safeStorage(),
): void {
  try {
    storage?.setItem(STORAGE_KEY, lang);
  } catch {
    // Private mode or blocked storage: the choice is still kept in memory and on the server.
  }
}

/** True when the user already chose a language in this browser. */
export function hasStoredLang(
  storage: Pick<Storage, 'getItem'> | undefined = safeStorage(),
): boolean {
  try {
    return isLang(storage?.getItem(STORAGE_KEY));
  } catch {
    return false;
  }
}

function safeStorage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}
