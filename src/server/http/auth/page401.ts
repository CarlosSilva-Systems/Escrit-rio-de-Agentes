import { t } from '../../i18n';

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * Static "open it from the shortcut" page for unauthenticated browsers. Carries no data and
 * no inline style/script (the CSP forbids them). Both languages are shown: there is no
 * session yet to know the preference.
 */
export function render401Page(): string {
  const sections = (['pt-BR', 'en'] as const)
    .map(
      (lang) =>
        `<section lang="${lang}"><h1>${escapeHtml(t(lang, 'http.unauthorized.title'))}</h1><p>${escapeHtml(
          t(lang, 'http.unauthorized.body'),
        )}</p></section>`,
    )
    .join('');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(
    t('pt-BR', 'http.unauthorized.title'),
  )}</title></head><body>${sections}</body></html>`;
}
