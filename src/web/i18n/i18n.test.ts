import { describe, expect, it } from 'vitest';
import en from './en.json';
import ptBR from './pt-BR.json';
import { dictionaries, hasStoredLang, readStoredLang, storeLang, translate } from './i18n';

describe('i18n', () => {
  it('CA-10: en.json has exactly the keys of pt-BR.json (none missing, none extra)', () => {
    const pt = Object.keys(ptBR).sort();
    const e = Object.keys(en).sort();
    expect(pt.filter((k) => !(k in en))).toEqual([]);
    expect(e.filter((k) => !(k in ptBR))).toEqual([]);
    expect(e).toEqual(pt);
  });

  it('CA-10: no translation is empty and placeholders match between languages', () => {
    const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const [key, value] of Object.entries(ptBR)) {
      expect(value.trim(), `pt-BR ${key}`).not.toBe('');
      expect((en as Record<string, string>)[key]?.trim(), `en ${key}`).not.toBe('');
      expect(
        placeholders((en as Record<string, string>)[key] as string),
        `placeholders of ${key}`,
      ).toEqual(placeholders(value));
    }
  });

  it('CA-10: switching language changes the text (pt-BR default, en alternative)', () => {
    expect(translate('pt-BR', 'top.sound.off')).toBe('Som desligado');
    expect(translate('en', 'top.sound.off')).toBe('Sound off');
    expect(translate('pt-BR', 'top.agents', { n: 3, total: 16 })).toBe('Agentes 3/16');
    expect(translate('en', 'top.agents', { n: 3, total: 16 })).toBe('Agents 3/16');
  });

  it('CA-10: a missing parameter keeps the placeholder visible instead of printing undefined', () => {
    expect(translate('en', 'state.offline')).toBe(
      'No connection to the server. Retrying in {n} s…',
    );
  });

  it('CA-10: the first load is pt-BR regardless of the browser language and the choice persists', () => {
    const memory = new Map<string, string>();
    const storage = {
      getItem: (k: string) => memory.get(k) ?? null,
      setItem: (k: string, v: string) => void memory.set(k, v),
    };
    expect(readStoredLang(storage)).toBe('pt-BR');
    expect(hasStoredLang(storage)).toBe(false);
    storeLang('en', storage);
    expect(readStoredLang(storage)).toBe('en');
    expect(hasStoredLang(storage)).toBe(true);
    memory.set('escritorio.lang', 'fr');
    expect(readStoredLang(storage)).toBe('pt-BR');
  });

  it('CA-10: storage that throws never breaks the app', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readStoredLang(broken)).toBe('pt-BR');
    expect(() => storeLang('en', broken)).not.toThrow();
  });

  it('CA-10: dictionaries expose both languages', () => {
    expect(Object.keys(dictionaries)).toEqual(['pt-BR', 'en']);
  });
});
