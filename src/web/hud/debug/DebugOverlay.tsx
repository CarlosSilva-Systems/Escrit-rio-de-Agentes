import { useEffect, useState } from 'react';
import { useT } from '../../AppContext';
import type { EngineMetrics, OfficeEngine } from '../../engine/engine';

/** Developer overlay (only with `?debug`): frame rate, frame time, zoom/scale, quality. */
export function DebugOverlay({
  engine,
  source,
}: {
  engine: OfficeEngine | null;
  source: 'file' | 'provisional' | null;
}) {
  const t = useT();
  const [m, setM] = useState<EngineMetrics | null>(null);

  useEffect(() => {
    if (!engine) return;
    const id = window.setInterval(() => {
      if (document.visibilityState !== 'hidden') setM(engine.metrics());
    }, 500);
    return () => window.clearInterval(id);
  }, [engine]);

  return (
    <aside className="debug-overlay" aria-label={t('debug.title')} data-testid="debug-overlay">
      <h2>{t('debug.title')}</h2>
      <dl>
        <dt>{t('debug.fps')}</dt>
        <dd data-testid="debug-fps">{m?.fps ?? '—'}</dd>
        <dt>{t('debug.frames')}</dt>
        <dd data-testid="debug-frames">{m?.rendered ?? '—'}</dd>
        <dt>{t('debug.hidden')}</dt>
        <dd>{m?.renderedWhileHidden ?? '—'}</dd>
        <dt>{t('debug.p95')}</dt>
        <dd>{m ? `${m.frameMsP95.toFixed(2)} ms` : '—'}</dd>
        <dt>{t('debug.zoom')}</dt>
        <dd>{m ? `${m.zoom}× (${m.scale}×)` : '—'}</dd>
        <dt>{t('debug.dpr')}</dt>
        <dd>{m ? m.dpr : '—'}</dd>
        <dt>{t('debug.quality')}</dt>
        <dd>{m?.quality ?? '—'}</dd>
        <dt>{t('debug.sprites')}</dt>
        <dd>{m?.sprites ?? '—'}</dd>
        <dt>{t('debug.world')}</dt>
        <dd>
          {source ? t(source === 'file' ? 'debug.world.file' : 'debug.world.provisional') : '—'}
        </dd>
      </dl>
    </aside>
  );
}
