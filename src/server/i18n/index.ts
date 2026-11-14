import { en } from './en';
import { ptBR } from './pt-BR';

export type Lang = 'pt-BR' | 'en';
export type MessageKey = keyof typeof ptBR;

const dictionaries: Record<Lang, Record<MessageKey, string>> = { 'pt-BR': ptBR, en };

export const DEFAULT_LANG: Lang = 'pt-BR';

export function resolveLang(input: string | undefined | null): Lang {
  if (!input) return DEFAULT_LANG;
  return input.toLowerCase().startsWith('en') ? 'en' : 'pt-BR';
}

/** Translate a server message; `{name}` placeholders are replaced from `params`. */
export function t(
  lang: Lang,
  key: MessageKey,
  params: Record<string, string | number> = {},
): string {
  const template = dictionaries[lang][key] ?? key;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in params ? String(params[name]) : whole,
  );
}

export function allDictionaries(): Record<Lang, Record<MessageKey, string>> {
  return dictionaries;
}
