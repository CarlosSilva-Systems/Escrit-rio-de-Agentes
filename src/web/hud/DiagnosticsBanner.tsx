import { useEffect, useState } from 'react';
import { useAppState, useServices, useT } from '../AppContext';
import { classifyDiagnostics, describeNotice, noticeSignature } from './diagnostics';
import { desktopNotDetected } from './desktopHint';

const MAX_SHOWN = 3;

/**
 * Thin dismissible strip (role=status) under the top bar. Real configuration problems (CA-13: file
 * and field, "keeping the last valid configuration") use the warning colour; a missing
 * escritorio.json is only an informative note (the QUADRO.md reserve team is the expected state
 * until the names are approved); the "Desktop sessions not detected" hint (CA-18) is quiet too.
 * All sentences come from i18n: raw server text is never shown.
 */
export function DiagnosticsBanner() {
  const t = useT();
  const { connection } = useServices();
  const diagnostics = useAppState((s) => s.snapshot?.diagnostics);
  const online = useAppState((s) => s.connection === 'online');
  const { missing, warnings } = classifyDiagnostics(diagnostics);
  const shown = warnings.slice(0, MAX_SHOWN);
  const signature = noticeSignature(missing, warnings);
  const [dismissedSig, setDismissedSig] = useState<string | null>(null);
  const [desktop, setDesktop] = useState(false);
  const [desktopDismissed, setDesktopDismissed] = useState(false);

  // Server counters are polled slowly and never while the tab is hidden.
  useEffect(() => {
    if (!online || desktopDismissed) return;
    let cancelled = false;
    const check = () => {
      if (document.visibilityState === 'hidden') return;
      connection
        .diag()
        .then((c) => {
          if (!cancelled) setDesktop(desktopNotDetected(c));
        })
        .catch(() => undefined);
    };
    check();
    const id = window.setInterval(check, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [connection, online, desktopDismissed]);

  const diagShown = missing || shown.length > 0;
  // One calm line at a time: the Desktop hint waits while a configuration notice is on screen.
  const showDesktop = desktop && !desktopDismissed && !(diagShown && dismissedSig !== signature);
  const diagVisible = dismissedSig !== signature;
  const showMissing = missing && diagVisible;
  const showWarnings = shown.length > 0 && diagVisible;
  if (!showMissing && !showWarnings && !showDesktop) return null;
  const tone = showWarnings ? 'banner--warn' : 'banner--info';

  return (
    <div className={`banner banner--thin ${tone}`} role="status" data-testid="diag-banner">
      {showMissing && <span data-testid="team-missing-note">{t('diag.team.missing')}</span>}
      {showWarnings && (
        <ul>
          {shown.map((d, i) => {
            const { key, params } = describeNotice(d);
            return <li key={`${d.code ?? d.file}|${d.path ?? ''}|${i}`}>{t(key, params)}</li>;
          })}
        </ul>
      )}
      {(showMissing || showWarnings) && (
        <button type="button" className="btn" onClick={() => setDismissedSig(signature)}>
          {t('common.dismiss')}
        </button>
      )}
      {showDesktop && (
        <span className="muted" data-testid="desktop-hint">
          {t('state.desktop')}{' '}
          <button type="button" className="btn" onClick={() => setDesktopDismissed(true)}>
            {t('common.dismiss')}
          </button>
        </span>
      )}
    </div>
  );
}
