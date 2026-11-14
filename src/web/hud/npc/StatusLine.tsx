import { useEffect, useState } from 'react';
import { useAppState, useT } from '../../AppContext';
import type { NpcLogical } from '../../../shared/contracts';
import { PixelIcon } from '../PixelIcon';
import { formatElapsed, isSleepy, statusText } from './npcInfo';

/** Re-renders every 15 s so "há 12 min" stays fresh without a timer per component. */
export function useNow(everyMs = 15_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), everyMs);
    return () => window.clearInterval(id);
  }, [everyMs]);
  return now;
}

/**
 * Status icon + text + how long ("Trabalhando em X no projeto Y · há 12 min"). The text always carries
 * the meaning; the icon only reinforces it (CA-72).
 */
export function StatusLine({
  logical,
  withIcon = true,
}: {
  logical: NpcLogical | null;
  withIcon?: boolean;
}) {
  const t = useT();
  useAppState((s) => s.lang);
  const now = useNow();
  const sleepy = isSleepy(logical, now);
  const text = statusText(
    logical,
    (p) => (p.kind === 'dev' ? p.name : t('proj.outside', { pasta: p.name })),
    sleepy,
  );
  const since = logical && logical.since > 0 ? formatElapsed(now - logical.since) : null;
  const iconName = text.icon === 'idle' ? null : text.icon;
  return (
    <span className="status-line">
      {withIcon && iconName && <PixelIcon name={iconName} />}
      <span>{t(text.key, text.params)}</span>
      {since && (
        <span className="muted">· {t('npc.since', { t: t(since.key, since.params) })}</span>
      )}
    </span>
  );
}
