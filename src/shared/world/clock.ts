// Studio clock and day/night ambient tint (GUIA-VISUAL §2.5). Always America/Sao_Paulo
// (UTC-3, no DST since 2019), whatever the browser's own time zone is.

export const STUDIO_TIME_ZONE = 'America/Sao_Paulo';

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

export type DayPhase = 'dawn' | 'day' | 'dusk' | 'night';

export interface ClockParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

let partsFormatter: Intl.DateTimeFormat | undefined;

export function brasiliaParts(date: Date): ClockParts {
  partsFormatter ??= new Intl.DateTimeFormat('en-US', {
    timeZone: STUDIO_TIME_ZONE,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  });
  const out: ClockParts = { year: 0, month: 0, day: 0, hour: 0, minute: 0, second: 0 };
  for (const p of partsFormatter.formatToParts(date)) {
    if (p.type in out) out[p.type as keyof ClockParts] = Number(p.value);
  }
  return out;
}

/** Minutes since local midnight in Brasília, fractional (seconds included). */
export function brasiliaMinutes(date: Date): number {
  const p = brasiliaParts(date);
  return p.hour * 60 + p.minute + p.second / 60;
}

/** `14:32` in 24 h, Brasília time, digits formatted for `locale`. */
export function formatBrasiliaClock(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: STUDIO_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}

/** Full date and time zone for the clock tooltip. */
export function formatBrasiliaFull(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: STUDIO_TIME_ZONE,
    dateStyle: 'full',
    timeStyle: 'short',
    hourCycle: 'h23',
  }).format(date);
}

// Phase boundaries in minutes since midnight and the overlay colours (tokens.css).
const DAWN_START = 5 * 60 + 30;
const DAY_START = 8 * 60;
const DUSK_START = 17 * 60;
const NIGHT_START = 19 * 60;
const BLEND_HALF = 15; // 30 min linear blend centred on each boundary

const TINT: Record<DayPhase, Rgba> = {
  dawn: { r: 255, g: 181, b: 138, a: 0.18 },
  day: { r: 255, g: 255, b: 255, a: 0 },
  dusk: { r: 255, g: 138, b: 91, a: 0.22 },
  night: { r: 30, g: 42, b: 94, a: 0.42 },
};

export function dayPhase(minutes: number): DayPhase {
  const m = ((minutes % 1440) + 1440) % 1440;
  if (m >= NIGHT_START || m < DAWN_START) return 'night';
  if (m >= DUSK_START) return 'dusk';
  if (m >= DAY_START) return 'day';
  return 'dawn';
}

function mix(a: Rgba, b: Rgba, t: number): Rgba {
  // Colour is blended weighted by alpha so a transparent "day" does not wash out the other tint.
  const wa = a.a * (1 - t);
  const wb = b.a * t;
  const total = wa + wb;
  const colour = (ca: number, cb: number) => (total === 0 ? ca : (ca * wa + cb * wb) / total);
  return {
    r: colour(a.r, b.r),
    g: colour(a.g, b.g),
    b: colour(a.b, b.b),
    a: a.a * (1 - t) + b.a * t,
  };
}

/** Ambient overlay for the map at a given minute of the day (Brasília). */
export function ambientTint(minutes: number): Rgba {
  const m = ((minutes % 1440) + 1440) % 1440;
  const boundaries: [number, DayPhase, DayPhase][] = [
    [DAWN_START, 'night', 'dawn'],
    [DAY_START, 'dawn', 'day'],
    [DUSK_START, 'day', 'dusk'],
    [NIGHT_START, 'dusk', 'night'],
  ];
  for (const [at, from, to] of boundaries) {
    if (Math.abs(m - at) < BLEND_HALF) {
      return mix(TINT[from], TINT[to], (m - (at - BLEND_HALF)) / (BLEND_HALF * 2));
    }
  }
  // Midnight wrap is inside the night phase on both sides, so no boundary there.
  return { ...TINT[dayPhase(m)] };
}

/** Room light levels (MAPA.md §10): extra overlay on top of the ambient tint. */
export type LightLevel = 'lit' | 'dim' | 'off';

export const LIGHT_LEVEL_TINT: Record<LightLevel, Rgba> = {
  lit: { r: 0, g: 0, b: 0, a: 0 },
  dim: { r: 14, g: 10, b: 20, a: 0.2 },
  off: { r: 14, g: 10, b: 20, a: 0.35 },
};
