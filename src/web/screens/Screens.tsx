import { useAppState, useServices, useT } from '../AppContext';
import type { Lang } from '../i18n/i18n';

/** Shown when the session is missing or expired (CA-03): the page cannot be used without the shortcut. */
export function AuthScreen() {
  const t = useT();
  const { connection } = useServices();
  const lang = useAppState((s) => s.lang);
  const other: Lang = lang === 'pt-BR' ? 'en' : 'pt-BR';
  return (
    <main className="screen" aria-labelledby="auth-title">
      <h1 id="auth-title">{t('auth.title')}</h1>
      <p>{t('auth.body')}</p>
      <div className="screen__actions">
        <button type="button" className="btn btn--primary" onClick={() => connection.retryNow()}>
          {t('auth.retry')}
        </button>
        <button
          type="button"
          className="btn"
          lang={other}
          onClick={() => connection.setLanguage(other)}
        >
          {other === 'en' ? 'English' : 'Português (Brasil)'}
        </button>
      </div>
    </main>
  );
}

export function LoadingScreen() {
  const t = useT();
  return (
    <main className="screen" aria-busy="true">
      <p role="status">{t('state.loading')}</p>
    </main>
  );
}

/** Offline banner under the top bar: countdown, "try now", and the long-outage hint. */
export function ConnectionBanner() {
  const t = useT();
  const { connection } = useServices();
  const retryInSec = useAppState((s) => s.retryInSec);
  return (
    <div className="banner" role="status">
      <span>
        {retryInSec === null ? t('state.connecting') : t('state.offline', { n: retryInSec })}
      </span>
      <span className="muted">{t('state.offline.long')}</span>
      <button type="button" className="btn" onClick={() => connection.retryNow()}>
        {t('state.offline.now')}
      </button>
    </div>
  );
}
