import { useEffect } from 'react';
import { useAppState, useServices, useT } from '../AppContext';

/** Announces the welcome / farewell scenes ("Novo na equipe: Nina") for everyone, not only on the map. */
export function NoticeBar() {
  const t = useT();
  const { store } = useServices();
  const notice = useAppState((s) => s.notice);

  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => store.setState({ notice: null }), 6_000);
    return () => window.clearTimeout(id);
  }, [notice, store]);

  return (
    <div className="notice-bar" role="status" aria-live="polite">
      {notice && notice.hired.length > 0 && (
        <span className="notice" data-testid="notice">
          {t('team.newhire', { nome: notice.hired.join(', ') })}
        </span>
      )}
      {notice && notice.provisional.length > 0 && (
        <span className="notice" data-testid="notice-provisional">
          {t('team.provisional', { nome: notice.provisional.join(', ') })}
        </span>
      )}
      {notice && notice.left.length > 0 && (
        <span className="notice" data-testid="notice">
          {t('team.farewell', { nome: notice.left.join(', ') })}
        </span>
      )}
    </div>
  );
}
