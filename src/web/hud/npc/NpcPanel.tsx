import { useEffect, useRef, useState } from 'react';
import type { ActivityItem } from '../../../shared/contracts';
import { formatBrasiliaClock } from '../../../shared/world/clock';
import { useAppState, useServices, useT } from '../../AppContext';
import { getEngine, getNpcs } from '../../engine/bridge';
import { intlLocale, type MessageKey } from '../../i18n/i18n';
import { KNOWN_DEPARTMENTS, npcInfo, projectName } from './npcInfo';
import { Portrait } from './Portrait';
import { hideHoverNow } from './hover';
import { StatusLine } from './StatusLine';

type HistoryState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ok'; items: ActivityItem[] };

/** Panel opened by clicking an NPC (or Enter on its row): status, tasks, recent history, follow. */
export function NpcPanel({ npcKey }: { npcKey: string }) {
  const t = useT();
  const { store, connection } = useServices();
  const lang = useAppState((s) => s.lang);
  const snapshot = useAppState((s) => s.snapshot);
  const followKey = useAppState((s) => s.ui.followKey);
  const info = npcInfo(snapshot, npcKey);
  const [history, setHistory] = useState<HistoryState>({ kind: 'loading' });
  const root = useRef<HTMLElement>(null);

  // Focus moves into the panel and returns to where it came from when it closes (like Modal).
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    return () => {
      const usable = previous?.isConnected && previous !== document.body;
      const target = usable
        ? previous
        : document.querySelector<HTMLElement>('[data-modal-return], [data-testid="office-canvas"]');
      target?.focus?.();
      // Focus returning to a team row would pop its hover card up again: close it.
      queueMicrotask(() => hideHoverNow(store));
    };
  }, [store]);

  // Clicking outside: a click on the map is handled by the engine (an NPC switches the panel, empty
  // floor closes it, see OfficeView); top-bar controls (language, sound...) deliberately keep it open.
  useEffect(() => {
    root.current?.focus();
  }, [npcKey]);

  // History: loaded at once for a new NPC, then refreshed (debounced 2 s) only when the STATUS
  // changes, so a busy NPC does not trigger a request per event. A failed refresh keeps the old items.
  const status = info?.logical?.status ?? 'none';
  const loadedFor = useRef<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const firstLoad = loadedFor.current !== npcKey;
    if (firstLoad) setHistory({ kind: 'loading' });
    loadedFor.current = npcKey;
    const timer = window.setTimeout(
      () => {
        connection
          .npcHistory(npcKey)
          .then((items) => {
            if (!cancelled) setHistory({ kind: 'ok', items: items.slice(0, 50) });
          })
          .catch(() => {
            if (!cancelled) setHistory((h) => (h.kind === 'ok' ? h : { kind: 'error' }));
          });
      },
      firstLoad ? 0 : 2_000,
    );
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [connection, npcKey, status]);

  if (!info) return null;
  const following = followKey === npcKey;
  const dept =
    info.departmentId && KNOWN_DEPARTMENTS.has(info.departmentId) ? info.departmentId : null;
  const logical = info.logical;
  const close = () => store.setState((s) => ({ ui: { ...s.ui, selectedNpc: null } }));
  const labelProject = (p: { kind: 'dev' | 'outside'; name: string }) =>
    p.kind === 'dev' ? p.name : t('proj.outside', { pasta: p.name });

  const toggleFollow = () => getEngine()?.follow(following ? null : npcKey);
  const goToDesk = () => {
    const tile = getNpcs()?.deskOf(npcKey);
    if (tile) getEngine()?.centerOnTile(tile[0], tile[1]);
  };

  return (
    <section
      ref={root}
      tabIndex={-1}
      className="npc-panel"
      role="dialog"
      aria-modal="false"
      aria-labelledby="npc-panel-title"
      data-testid="npc-panel"
    >
      <header className="npc-panel__head">
        <Portrait npcKey={info.key} agentType={info.agentType} size={48} />
        <div className="npc-panel__who">
          <h2 id="npc-panel-title">{info.fullName ?? info.name}</h2>
          {info.title && <div className="muted">{info.title}</div>}
          {info.kind === 'freelancer' ? (
            <span className="badge badge--visitor">{t('team.visitor')}</span>
          ) : (
            info.departmentName && (
              <span className={`badge${dept ? ` badge--${dept}` : ''}`}>{info.departmentName}</span>
            )
          )}
        </div>
        <button type="button" className="btn" onClick={close}>
          {t('common.close')}
        </button>
      </header>

      <p>
        <StatusLine logical={logical} />
      </p>

      <div className="npc-panel__actions">
        <button type="button" className="btn" aria-pressed={following} onClick={toggleFollow}>
          {following ? t('team.unfollow') : t('team.follow')}
        </button>
        <button type="button" className="btn" onClick={goToDesk}>
          {t('npc.goto.desk')}
        </button>
      </div>

      <h3>{t('npc.tasks')}</h3>
      {logical?.taskTitle || logical?.taskRef ? (
        <p>
          {logical.taskRef && <code>{logical.taskRef}</code>} {logical.taskTitle}
          {projectName(logical.project) && (
            <span className="muted">
              {' '}
              ·{' '}
              {labelProject(
                projectName(logical.project) as { kind: 'dev' | 'outside'; name: string },
              )}
            </span>
          )}
        </p>
      ) : (
        <p className="muted">{t('npc.tasks.none')}</p>
      )}

      <h3>{t('npc.history')}</h3>
      {history.kind === 'loading' && <p className="muted">{t('common.loading')}</p>}
      {history.kind === 'error' && <p role="alert">{t('npc.history.error')}</p>}
      {history.kind === 'ok' && history.items.length === 0 && (
        <p className="muted">{t('npc.empty')}</p>
      )}
      {history.kind === 'ok' && history.items.length > 0 && (
        <ol className="npc-history" data-testid="npc-history">
          {history.items.map((item) => (
            <li key={item.id}>
              <time dateTime={new Date(item.ts).toISOString()}>
                {formatBrasiliaClock(new Date(item.ts), intlLocale(lang))}
              </time>{' '}
              <span>{t(`act.kind.${item.kind}` as MessageKey)}</span>
              {item.tool && (
                <span className="muted"> · {t(`tool.${item.tool}` as MessageKey)}</span>
              )}
              {projectName(item.project) && (
                <span className="muted">
                  {' '}
                  ·{' '}
                  {labelProject(
                    projectName(item.project) as { kind: 'dev' | 'outside'; name: string },
                  )}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}

      <h3>{t('npc.tokens')}</h3>
      <p className="muted">{t('npc.tokens.na')}</p>
    </section>
  );
}
