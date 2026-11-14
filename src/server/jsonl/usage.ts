import { ZERO_USAGE } from './parseLine';
import type { JsonlRecord, UsageCounters } from './parseLine';

// Usage de-duplication (S-05 rule, CA-63). In the observed Claude Code format every content
// block of one API response (thinking, text, each tool_use) is written as its own assistant
// line carrying the SAME `message.id`, `requestId` and `usage`: summing every line inflates the
// totals (about 2.2x in the sampled sessions). Rule:
//   key = message.id, else requestId, else the line uuid (no key at all = count the line once)
//   per key keep the MAX of each counter; report only the increase over what was already seen.
// The deduper is scoped to ONE file (ids never repeat across files in the samples) and bounded.

export type UsageDelta = UsageCounters;

export interface DedupeStats {
  usageLines: number;
  duplicateLines: number;
  /** Usage lines that had no id/requestId/uuid (counted as unique). */
  withoutKey: number;
}

export const addUsage = (a: UsageCounters, b: UsageCounters): UsageCounters => ({
  input: a.input + b.input,
  output: a.output + b.output,
  cacheRead: a.cacheRead + b.cacheRead,
  cacheCreation: a.cacheCreation + b.cacheCreation,
});

export const isZeroUsage = (u: UsageCounters) =>
  u.input === 0 && u.output === 0 && u.cacheRead === 0 && u.cacheCreation === 0;

export function usageKey(r: JsonlRecord): string | undefined {
  const a = r.assistant;
  if (!a) return undefined;
  if (a.messageId) return `m:${a.messageId}`;
  if (a.requestId) return `r:${a.requestId}`;
  if (r.uuid) return `u:${r.uuid}`;
  return undefined;
}

export class UsageDeduper {
  private readonly seen = new Map<string, UsageCounters>();
  readonly stats: DedupeStats = { usageLines: 0, duplicateLines: 0, withoutKey: 0 };

  constructor(private readonly maxKeys = 50_000) {}

  /** Usage to add to the aggregate for this record (zeros when it is a pure duplicate). */
  add(record: JsonlRecord): UsageDelta {
    const usage = record.assistant?.usage;
    if (!usage) return { ...ZERO_USAGE };
    this.stats.usageLines++;
    const key = usageKey(record);
    if (key === undefined) {
      this.stats.withoutKey++;
      return { ...usage };
    }
    const prev = this.seen.get(key);
    if (!prev) {
      this.remember(key, usage);
      return { ...usage };
    }
    this.stats.duplicateLines++;
    const max: UsageCounters = {
      input: Math.max(prev.input, usage.input),
      output: Math.max(prev.output, usage.output),
      cacheRead: Math.max(prev.cacheRead, usage.cacheRead),
      cacheCreation: Math.max(prev.cacheCreation, usage.cacheCreation),
    };
    this.seen.set(key, max);
    return {
      input: max.input - prev.input,
      output: max.output - prev.output,
      cacheRead: max.cacheRead - prev.cacheRead,
      cacheCreation: max.cacheCreation - prev.cacheCreation,
    };
  }

  reset(): void {
    this.seen.clear();
    this.stats.usageLines = 0;
    this.stats.duplicateLines = 0;
    this.stats.withoutKey = 0;
  }

  private remember(key: string, usage: UsageCounters): void {
    this.seen.set(key, { ...usage });
    // Duplicates are adjacent lines, so dropping the oldest keys is safe.
    if (this.seen.size > this.maxKeys) {
      const oldest = this.seen.keys().next().value;
      if (oldest !== undefined) this.seen.delete(oldest);
    }
  }
}

/** Convenience for whole files/fixtures: deduplicated total of a list of records. */
export function sumDedupedUsage(records: readonly JsonlRecord[]): UsageCounters {
  const deduper = new UsageDeduper();
  let total: UsageCounters = { ...ZERO_USAGE };
  for (const r of records) total = addUsage(total, deduper.add(r));
  return total;
}
