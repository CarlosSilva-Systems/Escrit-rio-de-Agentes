import { useEffect } from 'react';
import { useAppState, useServices, useT } from './AppContext';
import { Credits } from './hud/credits/Credits';
import { resolveShortcut } from './hud/keyboard';
import { getEngine } from './engine/bridge';
import { DiagnosticsBanner } from './hud/DiagnosticsBanner';
import { Minimap } from './hud/Minimap';
import { NoticeBar } from './hud/NoticeBar';
import { hideHoverNow } from './hud/npc/hover';
import { NpcCard } from './hud/npc/NpcCard';
import { NpcPanel } from './hud/npc/NpcPanel';
import { TeamDrawer } from './hud/npc/TeamDrawer';
import { PanelShell } from './hud/PanelShell';
import { LogoutConfirm } from './hud/LogoutConfirm';
import { Shortcuts } from './hud/Shortcuts';
import { Topbar } from './hud/topbar/Topbar';
import { OfficeView } from './OfficeView';
import type { OfficeParams } from './params';
import { AuthScreen, ConnectionBanner, LoadingScreen } from './screens/Screens';
import type { PanelId } from './store/appState';

const PANEL_BY_ACTION = {
  chat: 'chat',
  tasks: 'tasks',
  approvals: 'approvals',
  map: 'map',
} as const;

/** Global keyboard layer: C/T/A/M toggle panels, ? opens help, Esc closes the innermost thing. */
function useGlobalShortcuts(): void {
  const { store } = useServices();
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const action = resolveShortcut(e);
      if (!action) return;
      const { ui } = store.getState();
      if (action === 'escape') {
        if (ui.modal) store.setState({ ui: { ...ui, modal: null } });
        else if (ui.menuOpen) store.setState({ ui: { ...ui, menuOpen: false } });
        else if (ui.selectedNpc) {
          // One Esc closes the highest layer (the panel and its hover card together); the next Esc
          // closes the team drawer, then stops following, then the C/T/A/M panels.
          store.setState({ ui: { ...ui, selectedNpc: null } });
          hideHoverNow(store);
        } else if (ui.hoverNpc) hideHoverNow(store);
        else if (ui.teamOpen) store.setState({ ui: { ...ui, teamOpen: false } });
        else if (getEngine()?.following) getEngine()?.follow(null);
        else if (ui.panel) store.setState({ ui: { ...ui, panel: null } });
        else return; // nothing to close: let the page (or the canvas) have it
        e.preventDefault();
        return;
      }
      if (ui.modal) return; // a modal owns the keyboard
      if (action === 'help') {
        store.setState({ ui: { ...ui, modal: 'shortcuts', menuOpen: false } });
      } else {
        const panel: PanelId = PANEL_BY_ACTION[action];
        store.setState({
          ui: { ...ui, panel: ui.panel === panel ? null : panel, menuOpen: false },
        });
      }
      e.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [store]);
}

/** Mirrors `prefers-reduced-motion` into the store and onto <html> (CA-22). */
function useReducedMotion(): void {
  const { store } = useServices();
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => {
      store.setState({ reducedMotion: query.matches });
      document.documentElement.toggleAttribute('data-reduce-motion', query.matches);
    };
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, [store]);
}

export function App({ params }: { params: OfficeParams }) {
  const t = useT();
  const { store } = useServices();
  const lang = useAppState((s) => s.lang);
  const connection = useAppState((s) => s.connection);
  const panel = useAppState((s) => s.ui.panel);
  const selectedNpc = useAppState((s) => s.ui.selectedNpc);
  const teamOpen = useAppState((s) => s.ui.teamOpen);
  const modal = useAppState((s) => s.ui.modal);

  useGlobalShortcuts();
  useReducedMotion();

  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = t('app.name');
  }, [lang, t]);

  const closeModal = () => store.setState((s) => ({ ui: { ...s.ui, modal: null } }));

  if (connection === 'unauthorized') return <AuthScreen />;
  if (connection === 'loading') return <LoadingScreen />;

  return (
    <>
      <Topbar />
      {connection === 'offline' && <ConnectionBanner />}
      <DiagnosticsBanner />
      <main className="stage">
        <OfficeView params={params} />
        {teamOpen && <TeamDrawer />}
        {selectedNpc && <NpcPanel npcKey={selectedNpc} />}
        <NpcCard />
        <Minimap />
        <NoticeBar />
        {panel && panel !== 'map' && <PanelShell panel={panel} />}
      </main>
      {modal === 'credits' && <Credits onClose={closeModal} />}
      {modal === 'shortcuts' && <Shortcuts onClose={closeModal} />}
      {modal === 'logout' && <LogoutConfirm onClose={closeModal} />}
    </>
  );
}
