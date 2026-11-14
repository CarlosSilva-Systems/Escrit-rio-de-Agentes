// Developer URL parameters (`?debug`, `?demo=20`, `?zoom=3`, `?debugTime=2026-12-24T21:00`, ...).
// They only change how the page LOOKS; nothing here reaches the server (ADR-0005).

import type { ZoomLevel } from '../shared/world/camera';
import type { QualitySetting } from './engine/quality';

export interface OfficeParams {
  debug: boolean;
  /** Number of demo walkers (0 = none). */
  demo: number;
  seed: number;
  zoom?: ZoomLevel;
  /** Simulated studio time. */
  debugTime?: Date;
  rain: boolean;
  /** Dirty-region rendering (default on); `?dirty=0` redraws the whole world each frame (A/B for S-02). */
  dirty: boolean;
  quality?: QualitySetting;
}

const MAX_DEMO = 64;

export function parseOfficeParams(search: string): OfficeParams {
  const q = new URLSearchParams(search);
  const flag = (name: string) => q.has(name) && q.get(name) !== '0' && q.get(name) !== 'false';

  const demoRaw = Number.parseInt(q.get('demo') ?? '', 10);
  const seedRaw = Number.parseInt(q.get('seed') ?? '', 10);
  const zoomRaw = Number.parseInt(q.get('zoom') ?? '', 10);
  const timeRaw = q.get('debugTime');
  const time = timeRaw ? new Date(timeRaw) : undefined;
  const quality = q.get('quality');

  return {
    debug: flag('debug'),
    demo: Number.isFinite(demoRaw) ? Math.min(MAX_DEMO, Math.max(0, demoRaw)) : 0,
    seed: Number.isFinite(seedRaw) ? seedRaw : 1,
    ...(zoomRaw === 2 || zoomRaw === 3 || zoomRaw === 4 ? { zoom: zoomRaw as ZoomLevel } : {}),
    ...(time && !Number.isNaN(time.getTime()) ? { debugTime: time } : {}),
    rain: flag('rain'),
    dirty: q.get('dirty') !== '0',
    ...(quality === 'auto' || quality === 'high' || quality === 'medium' || quality === 'low'
      ? { quality }
      : {}),
  };
}
