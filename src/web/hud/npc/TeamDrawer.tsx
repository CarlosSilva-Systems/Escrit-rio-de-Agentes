import { useAppState, useServices, useT } from '../../AppContext';
import { getEngine } from '../../engine/bridge';
import { hideHoverNow, showHover } from './hover';
import { npcInfo } from './npcInfo';
import { Portrait } from './Portrait';
import { StatusLine } from './StatusLine';

/**
 * Team list: the keyboard and screen-reader way to reach every NPC (the canvas is not navigable).
 * Focusing a row shows the same hover card; Enter opens the panel; "Follow" tracks the NPC.
 */
export function TeamDrawer() {
  const t = useT();
  const { store } = useServices();
  const snapshot = useAppState((s) => s.snapshot);
  const followKey = useAppState((s) => s.ui.followKey);
  const keys = [
    ...(snapshot?.team.agents.map((a) => a.agentType) ?? []),
    ...(snapshot?.npcs
      .filter((n) => n.kind === 'freelancer' && !(n.status === 'idle' && n.activeCount === 0))
      .map((n) => n.key) ?? []),
  ];

  const select = (key: string) => store.setState((s) => ({ ui: { ...s.ui, selectedNpc: key } }));
  const close = () => store.setState((s) => ({ ui: { ...s.ui, teamOpen: false } }));

  return (
    <aside className="team-drawer" aria-labelledby="team-title" data-testid="team-drawer">
      <header className="panel__header">
        <h2 id="team-title">{t('team.title')}</h2>
        <button type="button" className="btn" onClick={close}>
          {t('common.close')}
        </button>
      </header>
      {keys.length === 0 && <p className="muted">{t('team.empty')}</p>}
      <ul className="team-list">
        {keys.map((key) => {
          const info = npcInfo(snapshot, key);
          if (!info) return null;
          const following = followKey === key;
          return (
            <li key={key} className="team-row">
              <button
                type="button"
                className="team-row__main"
                data-npc={key}
                onClick={() => select(key)}
                onFocus={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  showHover(store, { key, x: r.right + 140, y: r.top + 70 });
                }}
                onBlur={() => hideHoverNow(store)}
              >
                <Portrait npcKey={key} agentType={info.agentType} size={32} />
                <span className="team-row__text">
                  <strong>{info.name}</strong>
                  <span className="muted">{info.title ?? info.agentType}</span>
                  <StatusLine logical={info.logical} />
                </span>
              </button>
              <button
                type="button"
                className="btn"
                aria-pressed={following}
                aria-label={
                  following ? t('team.unfollow') : t('team.follow.named', { nome: info.name })
                }
                onClick={() => getEngine()?.follow(following ? null : key)}
              >
                {following ? t('team.unfollow') : t('team.follow')}
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
