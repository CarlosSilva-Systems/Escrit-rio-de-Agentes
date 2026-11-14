import { useEffect, useRef } from 'react';
import { spriteKeyFor } from '../../../shared/npc/spriteKeys';
import { getNpcs, useEngine } from '../../engine/bridge';

/** 16x16 face of an NPC (feed, cards), drawn from the atlas. Decorative: the name is always next to it. */
export function Portrait({
  npcKey,
  agentType,
  size = 32,
}: {
  npcKey: string;
  agentType: string;
  size?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const engine = useEngine();
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !engine) return;
    const atlas = engine.atlas;
    const sheet =
      getNpcs()?.spriteKeyOf(npcKey) ??
      spriteKeyFor({ agentType }, (k) => atlas.frame(`${k}/idle/s/0`) !== undefined);
    const f = atlas.frame(`${sheet}/portrait`);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, 16, 16);
    if (f) ctx.drawImage(f.source, f.sx, f.sy, f.sw, f.sh, 0, 0, 16, 16);
  }, [engine, npcKey, agentType]);
  return (
    <canvas
      ref={ref}
      className="portrait"
      width={16}
      height={16}
      aria-hidden="true"
      style={{ width: size, height: size }}
    />
  );
}
