import { useEffect, useRef } from 'react';
import { createSurface } from '../engine/art/pixel';
import { ICON_SIZE, paintIcon, type IconName } from '../engine/art/icons';

/** Status sprite (GUIA-VISUAL §6) drawn on a tiny canvas; decorative, the adjacent text carries the meaning. */
export function PixelIcon({ name, scale = 2 }: { name: IconName; scale?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const art = paintIcon(name);
    // Copy through a detached surface so the visible canvas never needs readback.
    const out = createSurface(ICON_SIZE, ICON_SIZE, false);
    out.ctx.drawImage(art.canvas as CanvasImageSource, 0, 0);
    ctx.clearRect(0, 0, ICON_SIZE, ICON_SIZE);
    ctx.drawImage(out.canvas as CanvasImageSource, 0, 0);
  }, [name]);
  return (
    <canvas
      ref={ref}
      className="pixel-icon"
      width={ICON_SIZE}
      height={ICON_SIZE}
      aria-hidden="true"
      style={{ width: ICON_SIZE * scale, height: ICON_SIZE * scale }}
    />
  );
}
