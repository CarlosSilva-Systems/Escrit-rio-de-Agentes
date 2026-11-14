// Graceful degradation (CA-81): when frames get too expensive, optional effects switch off first
// (rain, particles, light flicker), then the ambient frame rate drops. Pure and testable.

export type QualityLevel = 'high' | 'medium' | 'low';
export type QualitySetting = 'auto' | QualityLevel;

export interface QualityFeatures {
  rain: boolean;
  particles: boolean;
  flicker: boolean;
  /** Rendering rate while only ambient animation runs. */
  ambientFps: number;
}

export const QUALITY_FEATURES: Record<QualityLevel, QualityFeatures> = {
  high: { rain: true, particles: true, flicker: true, ambientFps: 6 },
  medium: { rain: false, particles: false, flicker: true, ambientFps: 4 },
  low: { rain: false, particles: false, flicker: false, ambientFps: 2 },
};

const ORDER: QualityLevel[] = ['high', 'medium', 'low'];

export interface QualityOptions {
  /** p95 frame time (ms) above which quality drops one level. */
  budgetMs?: number;
  /** Frames examined per decision. */
  window?: number;
  /** Consecutive good windows before quality may rise again. */
  recoverWindows?: number;
}

export interface QualityController {
  /** Feed the duration of one rendered frame; returns the (possibly new) level. */
  record(frameMs: number): QualityLevel;
  setSetting(setting: QualitySetting): void;
  readonly level: QualityLevel;
  readonly setting: QualitySetting;
}

export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[idx] as number;
}

export function createQualityController(options: QualityOptions = {}): QualityController {
  const budget = options.budgetMs ?? 8;
  const windowSize = options.window ?? 120;
  const recoverWindows = options.recoverWindows ?? 5;
  let setting: QualitySetting = 'auto';
  let level: QualityLevel = 'high';
  let samples: number[] = [];
  let goodWindows = 0;

  return {
    get level() {
      return level;
    },
    get setting() {
      return setting;
    },
    setSetting(next) {
      setting = next;
      samples = [];
      goodWindows = 0;
      if (next !== 'auto') level = next;
    },
    record(frameMs) {
      if (setting !== 'auto') return level;
      samples.push(frameMs);
      if (samples.length < windowSize) return level;
      const p95 = percentile(samples, 0.95);
      samples = [];
      const idx = ORDER.indexOf(level);
      if (p95 > budget && idx < ORDER.length - 1) {
        level = ORDER[idx + 1] as QualityLevel;
        goodWindows = 0;
      } else if (p95 < budget * 0.5 && idx > 0) {
        // Be slow to trust a good window: cheap frames at "low" are partly cheap BECAUSE it is low.
        goodWindows++;
        if (goodWindows >= recoverWindows) {
          level = ORDER[idx - 1] as QualityLevel;
          goodWindows = 0;
        }
      } else {
        goodWindows = 0;
      }
      return level;
    },
  };
}
