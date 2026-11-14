import type { OfficeEvent } from '../contracts';

// Deduplication of events arriving from duplicate sources (settings + --settings hooks,
// hooks + JSONL fallback) - ADR-0004 §2: key = (session, kind, tool_use_id | agent_id).
// A source timestamp is deliberately NOT part of the key: the JSONL fallback has none in the
// same format, so including it would stop hook and JSONL copies from ever matching.
// - Events with a stable id (tool use id / agent id) dedupe over a long window.
// - Events without one dedupe only within a short sliding window (two identical hook calls).
// Pure: the clock is injected.

export interface DedupeOptions {
  now?: () => number;
  /** Window for events without a stable id. Default 2 s. */
  shortWindowMs?: number;
  /** Window for events with a stable id. Default 10 min. */
  stableWindowMs?: number;
  maxEntries?: number;
}

export interface DedupeKey {
  key: string;
  stable: boolean;
}

export function dedupeKeyOf(event: OfficeEvent): DedupeKey {
  const stableId = event.tool?.useId ?? event.agent.agentId ?? '';
  const key = [
    event.sessionId ?? '',
    event.kind,
    stableId,
    stableId === '' ? (event.agent.agentType ?? '') : '',
  ].join('|');
  return { key, stable: stableId !== '' };
}

export class EventDeduper {
  private readonly seen = new Map<string, { at: number; window: number }>();
  private readonly now: () => number;
  private readonly shortWindow: number;
  private readonly stableWindow: number;
  private readonly maxEntries: number;

  constructor(options: DedupeOptions = {}) {
    this.now = options.now ?? (() => Date.now());
    this.shortWindow = options.shortWindowMs ?? 2000;
    this.stableWindow = options.stableWindowMs ?? 10 * 60_000;
    this.maxEntries = options.maxEntries ?? 10_000;
  }

  /** true when the same event was already accepted inside its window (and records it otherwise). */
  isDuplicate(event: OfficeEvent): boolean {
    const { key, stable } = dedupeKeyOf(event);
    const t = this.now();
    const previous = this.seen.get(key);
    if (previous && t - previous.at < previous.window) {
      // Sliding window only for the short kind: a burst of identical hook calls stays one event.
      if (!stable) previous.at = t;
      return true;
    }
    this.seen.delete(key);
    this.seen.set(key, { at: t, window: stable ? this.stableWindow : this.shortWindow });
    if (this.seen.size > this.maxEntries) this.purge(t);
    return false;
  }

  get size(): number {
    return this.seen.size;
  }

  private purge(t: number): void {
    for (const [key, entry] of this.seen) {
      if (t - entry.at >= entry.window) this.seen.delete(key);
    }
    // Still over the cap: drop the oldest entries (Map keeps insertion order).
    for (const key of this.seen.keys()) {
      if (this.seen.size <= this.maxEntries) break;
      this.seen.delete(key);
    }
  }
}
