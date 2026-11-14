// Room lighting (ARQUITETURA §7.4, GUIA-VISUAL §2.5, MAPA.md §10). Done at 1x in two cached
// layers: a MULTIPLY layer (ambient tint x per-room level) and an additive GLOW layer (pre-baked
// pixel-style lamp halos). Both are rebuilt only when their inputs change, never per frame.

import type { Mapa } from '../../shared/contracts/mapa';
import { LIGHT_LEVEL_TINT, type LightLevel, type Rgba } from '../../shared/world/clock';
import { createSurface, rect, type PixelContext, type Surface } from './art/pixel';
import type { World } from './world/world';

export type ZoneLevels = ReadonlyMap<string, LightLevel>;

/**
 * Fixed light per zone (T-26): project-room zones start off (the 4 free slots are dark), the
 * server room is dim, everything else is lit. Dynamic activity levels arrive in phase 2.
 */
export function fixedZoneLevels(zones: Mapa['lightZones']): Map<string, LightLevel> {
  const levels = new Map<string, LightLevel>();
  for (const zone of zones) {
    if (zone.mode === 'activity') levels.set(zone.id, 'off');
    else if (zone.id === 'ZL-SRV') levels.set(zone.id, 'dim');
    else levels.set(zone.id, 'lit');
  }
  return levels;
}

/** The SOC keeps its own blue ambience: half of the night overlay, whatever the hour (MAPA.md §10). */
const SOC_EXTRA: Rgba = { r: 30, g: 42, b: 94, a: 0.21 };

/** Colour to MULTIPLY with so the result matches a normal-blend overlay of `tint` over white. */
export function toMultiplyColor(tint: Rgba): string {
  const mix = (c: number) => Math.round(255 * (1 - tint.a) + c * tint.a);
  return `rgb(${mix(tint.r)}, ${mix(tint.g)}, ${mix(tint.b)})`;
}

function disc(ctx: PixelContext, color: string, cx: number, cy: number, r: number): void {
  ctx.fillStyle = color;
  for (let y = -r; y <= r; y++)
    for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r) ctx.fillRect(cx + x, cy + y, 1, 1);
}

const GLOW_SIZE = 48;

/** Pre-baked lamp halo: 5 concentric discs, so it stays crisp pixel art (no smooth gradient). */
export function paintGlow(color: string): Surface {
  const surface = createSurface(GLOW_SIZE, GLOW_SIZE);
  const c = parseInt(color.slice(1), 16);
  const rgba = (a: number) => `rgba(${(c >> 16) & 255}, ${(c >> 8) & 255}, ${c & 255}, ${a})`;
  for (let k = 0; k < 5; k++)
    disc(surface.ctx, rgba(0.065), GLOW_SIZE / 2, GLOW_SIZE / 2, 22 - k * 4.2);
  return surface;
}

export class LightingLayer {
  /** MULTIPLY layer; white = no change. */
  readonly multiply: Surface;
  /** Additive halos (composited with `lighter`). */
  readonly glow: Surface;
  private key = '';
  private glows = new Map<string, Surface>();
  private neutralMultiply = true;
  private hasGlow = false;

  constructor(private readonly world: World) {
    this.multiply = createSurface(world.widthPx, world.heightPx, false);
    this.glow = createSurface(world.widthPx, world.heightPx, false);
  }

  get needsMultiply(): boolean {
    return !this.neutralMultiply;
  }

  get needsGlow(): boolean {
    return this.hasGlow;
  }

  /** Rebuilds the layers when ambient or zone levels changed. Returns true if it rebuilt. */
  update(ambient: Rgba, levels: ZoneLevels): boolean {
    const key = `${ambient.r | 0},${ambient.g | 0},${ambient.b | 0},${ambient.a.toFixed(3)}|${[...levels].map(([k, v]) => `${k}:${v}`).join(',')}`;
    if (key === this.key) return false;
    this.key = key;
    this.buildMultiply(ambient, levels);
    this.buildGlow(ambient, levels);
    return true;
  }

  private buildMultiply(ambient: Rgba, levels: ZoneLevels): void {
    const { ctx } = this.multiply;
    const { widthPx, heightPx } = this.world;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, widthPx, heightPx);
    rect(ctx, '#ffffff', 0, 0, widthPx, heightPx);
    ctx.globalCompositeOperation = 'multiply';
    let neutral = true;
    if (ambient.a > 0.002) {
      rect(ctx, toMultiplyColor(ambient), 0, 0, widthPx, heightPx);
      neutral = false;
    }
    for (const zone of this.world.map.lightZones) {
      const tints: Rgba[] = [];
      const level = levels.get(zone.id) ?? 'lit';
      if (LIGHT_LEVEL_TINT[level].a > 0) tints.push(LIGHT_LEVEL_TINT[level]);
      if (zone.id === 'ZL-SOC') tints.push(SOC_EXTRA);
      for (const tint of tints) {
        ctx.fillStyle = toMultiplyColor(tint);
        for (const [x, y, w, h] of this.world.zoneRects.get(zone.id) ?? [])
          ctx.fillRect(x, y, w, h);
        neutral = false;
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    this.neutralMultiply = neutral;
  }

  private buildGlow(ambient: Rgba, levels: ZoneLevels): void {
    const { ctx } = this.glow;
    ctx.clearRect(0, 0, this.world.widthPx, this.world.heightPx);
    // Lamps matter when it is getting dark; "always" zones (cold office light) glow faintly all day.
    const darkness = Math.min(1, Math.max(0, (ambient.a - 0.05) / 0.37));
    const modeByZone = new Map(this.world.map.lightZones.map((z) => [z.id, z.mode]));
    let any = false;
    for (const light of this.world.map.lights) {
      if ((levels.get(light.zone) ?? 'lit') === 'off') continue;
      const always = modeByZone.get(light.zone) === 'always';
      const strength = always ? Math.max(0.3, darkness) : darkness;
      if (strength < 0.05) continue;
      let sprite = this.glows.get(light.color);
      if (!sprite) {
        sprite = paintGlow(light.color);
        this.glows.set(light.color, sprite);
      }
      ctx.globalAlpha = strength;
      ctx.drawImage(
        sprite.canvas as CanvasImageSource,
        light.tile[0] * 16 + 8 - GLOW_SIZE / 2,
        light.tile[1] * 16 + 8 - GLOW_SIZE / 2,
      );
      any = true;
    }
    ctx.globalAlpha = 1;
    this.hasGlow = any;
  }
}
