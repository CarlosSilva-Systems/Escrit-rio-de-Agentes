import { useCallback, useEffect, useRef, useState } from 'react';
import { formatBrasiliaClock, formatBrasiliaFull } from '../../../shared/world/clock';
import { useAppState, useServices, useT } from '../../AppContext';
import { intlLocale, type Lang } from '../../i18n/i18n';
import { activeProjects, agentsWorking, studioName, teamSize } from '../../store/appState';
import { PixelIcon } from '../PixelIcon';

/** Studio clock (Brasília), re-rendered only when the displayed minute changes. */
const systemNow = () => new Date(); // module-level: a default created per render re-ran the effect forever

export function useStudioClock(lang: Lang, now: () => Date = systemNow) {
  const read = useCallback(() => {
    const d = now();
    const locale = intlLocale(lang);
    return {
      text: formatBrasiliaClock(d, locale),
      full: formatBrasiliaFull(d, locale),
      iso: d.toISOString(),
    };
  }, [lang, now]);
  const [value, setValue] = useState(read);
  useEffect(() => {
    const sync = () => {
      const next = read();
      setValue((prev) => (prev.text === next.text && prev.full === next.full ? prev : next));
    };
    sync();
    const id = window.setInterval(sync, 5_000);
    return () => window.clearInterval(id);
  }, [read]);
  return value;
}

export function Topbar() {
  const t = useT();
  const { store, connection } = useServices();
  const lang = useAppState((s) => s.lang);
  const soundOn = useAppState((s) => s.soundOn);
  const snapshot = useAppState((s) => s.snapshot);
  const menuOpen = useAppState((s) => s.ui.menuOpen);
  const teamOpen = useAppState((s) => s.ui.teamOpen);
  const clock = useStudioClock(lang);
  const menuButton = useRef<HTMLButtonElement>(null);

  const working = agentsWorking(snapshot);
  const total = teamSize(snapshot);
  const projects = activeProjects(snapshot);
  const name = studioName(snapshot) ?? t('studio.placeholder');
  const otherLang: Lang = lang === 'pt-BR' ? 'en' : 'pt-BR';

  const toggleMenu = () => store.setState((s) => ({ ui: { ...s.ui, menuOpen: !s.ui.menuOpen } }));
  const openModal = (modal: 'credits' | 'shortcuts' | 'logout') =>
    store.setState((s) => ({ ui: { ...s.ui, modal, menuOpen: false } }));

  return (
    <header className="topbar" aria-label={t('top.label')}>
      <a className="skip-link" href="#office">
        {t('app.skip')}
      </a>
      <h1 className="topbar__studio">{name}</h1>
      <time
        className="topbar__clock"
        dateTime={clock.iso}
        title={clock.full}
        aria-label={`${t('top.clock.label')}: ${clock.text}`}
      >
        {clock.text}
      </time>
      <div
        className="topbar__kv"
        role="group"
        aria-label={t('top.agents.aria', { n: working, total })}
      >
        <PixelIcon name="gear" />
        <span aria-hidden="true">{t('top.agents', { n: working, total })}</span>
        <span className="topbar__caption" aria-hidden="true">
          {t('top.agents.caption')}
        </span>
      </div>
      <div className="topbar__kv">{t('top.projects', { n: projects })}</div>
      <span className="topbar__spacer" />
      <button
        type="button"
        className="btn"
        aria-pressed={teamOpen}
        onClick={() => store.setState((s) => ({ ui: { ...s.ui, teamOpen: !s.ui.teamOpen } }))}
      >
        {t('top.team')}
      </button>
      <button
        type="button"
        className="btn"
        aria-pressed={soundOn}
        onClick={() => connection.setSound(!soundOn)}
      >
        {soundOn ? t('top.sound.on') : t('top.sound.off')}
      </button>
      <button
        type="button"
        className="btn"
        lang={otherLang}
        aria-label={t('top.lang.to', { lang: t(otherLang === 'en' ? 'lang.en' : 'lang.pt-BR') })}
        title={t('top.lang')}
        onClick={() => connection.setLanguage(otherLang)}
      >
        {lang === 'pt-BR' ? 'PT' : 'EN'}
      </button>
      <div className="menu">
        <button
          ref={menuButton}
          type="button"
          className="btn"
          data-modal-return
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={toggleMenu}
        >
          {t('top.settings')}
        </button>
        {menuOpen && (
          <Menu
            onClose={() => store.setState((s) => ({ ui: { ...s.ui, menuOpen: false } }))}
            returnFocus={menuButton}
          >
            <button
              type="button"
              role="menuitem"
              className="menu__item"
              onClick={() => openModal('credits')}
            >
              {t('set.credits')}
            </button>
            <button
              type="button"
              role="menuitem"
              className="menu__item"
              onClick={() => openModal('shortcuts')}
            >
              {t('set.shortcuts')}
            </button>
            <button
              type="button"
              role="menuitem"
              className="menu__item"
              onClick={() => openModal('logout')}
            >
              {t('top.logout')}
            </button>
          </Menu>
        )}
      </div>
    </header>
  );
}

function Menu({
  children,
  onClose,
  returnFocus,
}: {
  children: React.ReactNode;
  onClose: () => void;
  returnFocus: React.RefObject<HTMLButtonElement | null>;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const away = (e: MouseEvent) => {
      if (
        ref.current &&
        !ref.current.contains(e.target as Node) &&
        e.target !== returnFocus.current
      )
        onClose();
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [onClose, returnFocus]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const items = [...(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown') items[(i + 1) % items.length]?.focus();
    else if (e.key === 'ArrowUp') items[(i - 1 + items.length) % items.length]?.focus();
    else if (e.key === 'Home') items[0]?.focus();
    else if (e.key === 'End') items[items.length - 1]?.focus();
    else if (e.key === 'Escape') {
      onClose();
      returnFocus.current?.focus();
    } else if (e.key === 'Tab') onClose();
    else return;
    if (e.key !== 'Tab') {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  return (
    <div ref={ref} className="menu__list" role="menu" onKeyDown={onKeyDown}>
      {children}
    </div>
  );
}
