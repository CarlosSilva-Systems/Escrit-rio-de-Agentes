import { parseHookPayload, type OfficeEvent } from '../../shared/contracts';
import {
  createEventFactory,
  EventDeduper,
  type EventBus,
  type EventFactory,
} from '../../shared/events';
import { normalizeHookPayload } from './normalize';

// HookIngest (T-16): raw hook body -> tolerant parse -> normalize -> dedupe -> EventBus.
// Also the single entry for events from other sources (JSONL fallback). Keeps only counters.

export type IngestOutcome = 'accepted' | 'invalid' | 'ignored' | 'duplicate';

/** Metadata-only log line (never payload content). */
export type IngestLog = (info: {
  kind: string;
  source: string;
  agentType: string | null;
  project: string | null;
  ms: number;
}) => void;

export interface IngestOptions {
  bus: EventBus;
  devRoot: string;
  now?: () => number;
  deduper?: EventDeduper;
  makeEvent?: EventFactory;
  log?: IngestLog;
  /** Maps a case-insensitive folder name to the real one (ProjectCatalog, later). */
  canonicalName?: (name: string) => string | undefined;
}

const LATENCY_SAMPLES = 256;

export class Counters {
  private readonly values = new Map<string, number>();
  inc(name: string, by = 1): void {
    this.values.set(name, (this.values.get(name) ?? 0) + by);
  }
  set(name: string, value: number): void {
    this.values.set(name, value);
  }
  get(name: string): number {
    return this.values.get(name) ?? 0;
  }
  toRecord(): Record<string, number> {
    return Object.fromEntries([...this.values].sort(([a], [b]) => a.localeCompare(b)));
  }
}

export class IngestService {
  readonly counters = new Counters();
  readonly makeEvent: EventFactory;
  private readonly bus: EventBus;
  private readonly deduper: EventDeduper;
  private readonly now: () => number;
  private readonly latencies: number[] = [];
  private latencyIdx = 0;

  constructor(private readonly options: IngestOptions) {
    this.bus = options.bus;
    this.now = options.now ?? (() => Date.now());
    this.deduper = options.deduper ?? new EventDeduper({ now: this.now });
    this.makeEvent = options.makeEvent ?? createEventFactory({ now: this.now });
  }

  /** Never throws: every failure is a counter. */
  ingestHook(body: unknown): IngestOutcome {
    const start = this.now();
    this.counters.inc('ingest.received');
    try {
      const parsed = parseHookPayload(body);
      if (!parsed.ok) {
        this.counters.inc('ingest.invalid');
        return 'invalid';
      }
      const result = normalizeHookPayload(parsed.payload, {
        devRoot: this.options.devRoot,
        makeEvent: this.makeEvent,
        now: start,
        ...(this.options.canonicalName
          ? { project: { canonicalName: this.options.canonicalName } }
          : {}),
      });
      if (!result.ok) {
        this.counters.inc('ingest.ignored');
        return 'ignored';
      }
      if (this.deduper.isDuplicate(result.event)) {
        this.counters.inc('ingest.duplicate');
        return 'duplicate';
      }
      this.publish(result.event, start);
      return 'accepted';
    } catch {
      // Defensive: a bug here must never turn into a 5xx for the hook (nor log content).
      this.counters.inc('ingest.error');
      return 'invalid';
    }
  }

  /** Events built by other sources (JSONL watcher). Returns false for a duplicate. */
  ingestEvent(event: OfficeEvent): boolean {
    this.counters.inc('ingest.received');
    if (this.deduper.isDuplicate(event)) {
      this.counters.inc('ingest.duplicate');
      return false;
    }
    this.publish(event, this.now());
    return true;
  }

  /** p50/p95 of the time spent processing an event (ms). */
  latency(): { p50: number; p95: number } {
    if (this.latencies.length === 0) return { p50: 0, p95: 0 };
    const sorted = [...this.latencies].sort((a, b) => a - b);
    const at = (q: number) =>
      sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
    return { p50: at(0.5), p95: at(0.95) };
  }

  private publish(event: OfficeEvent, startedAt: number): void {
    this.counters.inc('ingest.accepted');
    this.counters.inc(`ingest.source.${event.source}`);
    this.counters.inc(`ingest.kind.${event.kind}`);
    this.bus.emit(event);
    const ms = Math.max(0, this.now() - startedAt);
    this.latencies[this.latencyIdx++ % LATENCY_SAMPLES] = ms;
    this.options.log?.({
      kind: event.kind,
      source: event.source,
      agentType: event.agent.agentType,
      project:
        event.project.kind === 'dev'
          ? event.project.name
          : event.project.kind === 'outside'
            ? event.project.basename
            : null,
      ms,
    });
  }
}
