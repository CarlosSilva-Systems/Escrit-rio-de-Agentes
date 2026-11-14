import { parseJsonlLine } from './parseLine';
import type { IgnoreReason, JsonlRecord, UsageCounters } from './parseLine';
import type { JsonlTailer } from './tail';
import { isZeroUsage, UsageDeduper } from './usage';
import type { DedupeStats } from './usage';

// Glue of the pure parts: tail -> tolerant parse -> per-file usage dedupe. It does NOT touch the
// EventBus/server (T-16/T-21 wire it). One instance can follow many files.

export interface IngestedRecord {
  record: JsonlRecord;
  /** Deduplicated usage increase carried by this line; null when it has none (or it is a pure duplicate). */
  usageDelta: UsageCounters | null;
}

export interface IngestPoll {
  records: IngestedRecord[];
  /** Corrupt/unknown lines skipped (feeds the "N linhas ignoradas" counter, CA-63). */
  ignoredLines: number;
  ignoredByReason: Partial<Record<IgnoreReason | 'oversized', number>>;
  truncated: boolean;
  gone: boolean;
  more: boolean;
}

export class JsonlIngestor {
  private readonly dedupers = new Map<string, UsageDeduper>();

  constructor(
    readonly tailer: JsonlTailer,
    private readonly maxDedupeKeys = 50_000,
  ) {}

  async poll(path: string): Promise<IngestPoll> {
    const tail = await this.tailer.poll(path);
    if (tail.gone) this.dedupers.delete(path);
    // The file content restarted: ids may legitimately be seen again.
    if (tail.truncated) this.dedupers.get(path)?.reset();

    let deduper = this.dedupers.get(path);
    if (!deduper) {
      deduper = new UsageDeduper(this.maxDedupeKeys);
      this.dedupers.set(path, deduper);
    }

    const out: IngestPoll = {
      records: [],
      ignoredLines: tail.oversizedLines,
      ignoredByReason: tail.oversizedLines > 0 ? { oversized: tail.oversizedLines } : {},
      truncated: tail.truncated,
      gone: tail.gone,
      more: tail.more,
    };
    for (const line of tail.lines) {
      const parsed = parseJsonlLine(line);
      if (parsed.kind === 'empty') continue;
      if (parsed.kind === 'ignored') {
        out.ignoredLines++;
        out.ignoredByReason[parsed.reason] = (out.ignoredByReason[parsed.reason] ?? 0) + 1;
        continue;
      }
      const delta = parsed.record.assistant?.usage ? deduper.add(parsed.record) : null;
      out.records.push({
        record: parsed.record,
        usageDelta: delta && !isZeroUsage(delta) ? delta : null,
      });
    }
    return out;
  }

  stats(path: string): DedupeStats | undefined {
    return this.dedupers.get(path)?.stats;
  }

  forget(path: string): void {
    this.dedupers.delete(path);
    this.tailer.forget(path);
  }
}
