import { useServices, useT } from '../AppContext';
import type { MessageKey } from '../i18n/i18n';
import type { PanelId } from '../store/appState';

const TITLES: Record<PanelId, MessageKey> = {
  chat: 'panel.chat',
  tasks: 'panel.tasks',
  approvals: 'panel.approvals',
  map: 'panel.map',
};

/**
 * Empty drawer shell opened by the C/T/A/M shortcuts. The real contents (chat, kanban, approvals,
 * minimap) arrive in the next blocks; the shell fixes the placement, focus and Esc behaviour.
 */
export function PanelShell({ panel }: { panel: PanelId }) {
  const t = useT();
  const { store } = useServices();
  const titleId = `panel-${panel}-title`;
  return (
    <section className={`panel panel--${panel}`} aria-labelledby={titleId} data-panel={panel}>
      <header className="panel__header">
        <h2 id={titleId}>{t(TITLES[panel])}</h2>
        <button
          type="button"
          className="btn"
          onClick={() => store.setState((s) => ({ ui: { ...s.ui, panel: null } }))}
        >
          {t('common.close')}
        </button>
      </header>
      <p className="muted">{t('panel.soon')}</p>
    </section>
  );
}
