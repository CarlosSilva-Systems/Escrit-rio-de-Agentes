import { useEffect, useRef } from 'react';
import { useAppState, useT } from '../AppContext';
import { DEPARTMENT_COLORS } from '../engine/art/palette';
import { getNpcs, useEngine } from '../engine/bridge';
import { npcInfo } from './npc/npcInfo';

const SMALL = { w: 160, h: 130 };
const LARGE = { w: 320, h: 260 };
const WORLD = { w: 1024, h: 832 };

/**
 * Minimap in the corner (M makes it bigger): the static floor plan scaled down, one coloured dot per
 * NPC (department colour) and the visible area. Redrawn at 2 fps and never while the tab is hidden.
 * Clicking centres the camera. Keyboard users have the arrow keys and the team list instead.
 */
export function Minimap() {
  const t = useT();
  const engine = useEngine();
  const expanded = useAppState((s) => s.ui.panel === 'map');
  const snapshot = useAppState((s) => s.snapshot);
  const ref = useRef<HTMLCanvasElement>(null);
  const size = expanded ? LARGE : SMALL;
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !engine) return;
    const draw = () => {
      if (document.visibilityState === 'hidden') return;
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = '#1F1A17';
      ctx.fillRect(0, 0, size.w, size.h);
      ctx.drawImage(engine.minimapBase, 0, 0, WORLD.w, WORLD.h, 0, 0, size.w, size.h);
      const sx = size.w / WORLD.w;
      const sy = size.h / WORLD.h;
      for (const row of getNpcs()?.debug() ?? []) {
        const info = npcInfo(snapshotRef.current, row.key);
        const dept = info?.departmentId ? DEPARTMENT_COLORS[info.departmentId] : undefined;
        ctx.fillStyle = dept?.light ?? '#D4C3B0';
        ctx.fillRect(Math.round((row.x + 6) * sx) - 1, Math.round((row.y - 4) * sy) - 1, 3, 3);
      }
      const v = engine.viewWorldRect();
      if (v) {
        ctx.strokeStyle = '#FFD84D';
        ctx.lineWidth = 1;
        ctx.strokeRect(
          Math.round(v.x * sx) + 0.5,
          Math.round(v.y * sy) + 0.5,
          Math.round(v.w * sx),
          Math.round(v.h * sy),
        );
      }
    };
    draw();
    const id = window.setInterval(draw, 500);
    return () => window.clearInterval(id);
  }, [engine, size.w, size.h]);

  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    engine?.centerOnWorld(
      ((e.clientX - r.left) / r.width) * WORLD.w,
      ((e.clientY - r.top) / r.height) * WORLD.h,
    );
  };

  return (
    <div className="minimap" data-panel={expanded ? 'map' : undefined} data-testid="minimap">
      <canvas
        ref={ref}
        width={size.w}
        height={size.h}
        role="img"
        aria-label={t('map.minimap')}
        onClick={onClick}
        style={{ width: size.w, height: size.h }}
      />
    </div>
  );
}
