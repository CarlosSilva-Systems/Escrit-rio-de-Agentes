import { useLayoutEffect, useRef, useState } from 'react';
import { useAppState, useServices, useT } from '../../AppContext';
import { KNOWN_DEPARTMENTS, npcInfo } from './npcInfo';
import { setOverCard } from './hover';
import { Portrait } from './Portrait';
import { StatusLine } from './StatusLine';

const CARD_W = 268;

/** Hover card of an NPC: face, full name, title, department and live status. Positioned near the head. */
export function NpcCard() {
  const t = useT();
  const { store } = useServices();
  const hover = useAppState((s) => s.ui.hoverNpc);
  const snapshot = useAppState((s) => s.snapshot);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const info = hover ? npcInfo(snapshot, hover.key) : null;

  useLayoutEffect(() => {
    if (!hover || !ref.current) return;
    const h = ref.current.offsetHeight;
    const left = Math.min(Math.max(8, hover.x - CARD_W / 2), window.innerWidth - CARD_W - 8);
    const above = hover.y - h - 10;
    setPos({ left, top: above >= 64 ? above : hover.y + 44 });
  }, [hover, info?.name, snapshot]);

  if (!hover || !info) return null;
  const dept =
    info.departmentId && KNOWN_DEPARTMENTS.has(info.departmentId) ? info.departmentId : null;
  return (
    <div
      ref={ref}
      className="npc-card"
      role="tooltip"
      data-testid="npc-card"
      data-npc={info.key}
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, width: CARD_W }}
      onPointerEnter={() => setOverCard(true, store)}
      onPointerLeave={() => setOverCard(false, store)}
    >
      <div className="npc-card__head">
        <Portrait npcKey={info.key} agentType={info.agentType} />
        <div>
          <strong className="npc-card__name">{info.fullName ?? info.name}</strong>
          {info.title && <div className="muted">{info.title}</div>}
        </div>
      </div>
      {info.kind === 'freelancer' ? (
        <span className="badge badge--visitor">{t('team.visitor')}</span>
      ) : (
        info.departmentName && (
          <span className={`badge${dept ? ` badge--${dept}` : ''}`}>{info.departmentName}</span>
        )
      )}
      {info.kind === 'freelancer' && <div className="muted">{info.agentType}</div>}
      <StatusLine logical={info.logical} />
    </div>
  );
}
