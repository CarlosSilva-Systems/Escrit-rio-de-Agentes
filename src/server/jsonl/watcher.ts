import { existsSync, watch, type FSWatcher } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { categorizeTool, type OfficeEvent, type ProjectRef } from '../../shared/contracts';
import type { EventFactory } from '../../shared/events';
import { JsonlIngestor, type IngestedRecord } from './ingest';
import { cwdToProject, type CwdProjectOptions } from './project';
import { parseSubagentMeta, parseSubagentPath } from './subagent';
import { JsonlTailer, nodeTailFs } from './tail';

// JsonlWatcher (T-19, ADR-0006): fallback event source (Level 0) for sessions the panel does
// not own (Desktop, other terminals) and for installs without hooks. Watches
// `~/.claude/projects/**` and turns file activity into the same events the hooks produce, with
// `source: "jsonl"`:
//   - a new `subagents/agent-<id>.jsonl`            -> subagent.start (type from `.meta.json`,
//                                                      "unknown" after a short grace period)
//   - `.meta.json` with `finished:true`             -> subagent.stop
//   - assistant `tool_use` blocks                   -> tool.pre
//   - assistant `stop_reason: "end_turn"` (main)    -> turn.stop
//   - `cwd` inside the lines                        -> project under "7 - DEV" (CA-44)
// History is never replayed: at start only RECENT files are adopted, at their current end.
// PRIVACY: the parser keeps ids, tool names and counters only; no text ever leaves it.

export interface JsonlWatcherOptions {
  projectsDir: string;
  devRoot: string;
  makeEvent: EventFactory;
  /** Receives each event (the ingest service dedupes it against hook events). */
  emit: (event: OfficeEvent) => void;
  now?: () => number;
  /** How long to wait for `.meta.json` before announcing a subagent as "unknown". Default 1000. */
  metaGraceMs?: number;
  /** Files/subagents touched within this window are adopted at start. Default 10 min. */
  activeWindowMs?: number;
  /** Poll interval of tracked files (safety net for missed fs events). Default 2000. */
  pollMs?: number;
  /** Interval of the discovery walk (safety net for missed fs events). Default 15000. */
  discoverMs?: number;
  /** A started subagent whose file shows no activity for this long gets a synthetic stop. Default 120 s. */
  inactivityStopMs?: number;
  project?: CwdProjectOptions;
}

export interface JsonlWatcherStats {
  watching: boolean;
  trackedFiles: number;
  eventsEmitted: number;
  ignoredLines: number;
  errors: number;
  syntheticStops: number;
}

interface FileState {
  path: string;
  kind: 'main' | 'sub';
  sessionId: string;
  agentId?: string;
  metaPath?: string;
  agentType?: string | null;
  firstSeen: number;
  tracked: boolean;
  started: boolean;
  stopped: boolean;
  fromStart: boolean;
  pending: IngestedRecord[];
  graceTimer?: NodeJS.Timeout;
  lastActivity: number;
}

const MAX_PENDING_RECORDS = 500;
const MAX_SESSION_PROJECTS = 500;
const IDLE_UNTRACK_MS = 30 * 60_000;
const OLD_FILE_CACHE_MS = 5 * 60_000;
const MAX_OLD_CACHE = 5000;
const STOP_WAIT_MS = 2000;
const SESSION_FILE_RE = /^([A-Za-z0-9_-]{8,64})\.jsonl$/;
const DEBOUNCE_MS = 30;

export class JsonlWatcher {
  private readonly ingestor = new JsonlIngestor(new JsonlTailer(nodeTailFs));
  private readonly files = new Map<string, FileState>();
  private readonly projectBySession = new Map<string, ProjectRef>();
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly now: () => number;
  private readonly graceMs: number;
  private readonly activeMs: number;
  private fsWatcher: FSWatcher | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private discoverTimer: NodeJS.Timeout | null = null;
  private dirPoll: NodeJS.Timeout | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private startedAt = 0;
  private stopped = true;
  /** Files known to be older than the active window (skipped by the safety-net walk for a while). */
  private readonly oldUntil = new Map<string, number>();
  private readonly stat = { eventsEmitted: 0, ignoredLines: 0, errors: 0, syntheticStops: 0 };

  constructor(private readonly options: JsonlWatcherOptions) {
    this.now = options.now ?? (() => Date.now());
    this.graceMs = options.metaGraceMs ?? 1000;
    this.activeMs = options.activeWindowMs ?? 10 * 60_000;
  }

  stats(): JsonlWatcherStats {
    return {
      watching: this.fsWatcher !== null,
      trackedFiles: [...this.files.values()].filter((f) => f.tracked).length,
      ...this.stat,
    };
  }

  /** Adopts recent files and starts watching. Never throws. */
  async start(): Promise<void> {
    this.stopped = false;
    this.startedAt = this.now();
    try {
      await this.enqueue(() => this.walk(true));
      this.attachWatcher();
      this.pollTimer = setInterval(() => this.pollTracked(), this.options.pollMs ?? 2000);
      this.discoverTimer = setInterval(
        () => void this.enqueue(() => this.walk(false)),
        this.options.discoverMs ?? 15_000,
      );
      this.pollTimer.unref();
      this.discoverTimer.unref();
    } catch {
      this.stat.errors++; // the watcher is a fallback source: never take the server down
    }
  }

  /** Stops watching and waits (bounded) for the work already in flight. */
  async stop(): Promise<void> {
    this.stopped = true;
    this.fsWatcher?.close();
    this.fsWatcher = null;
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.discoverTimer) clearInterval(this.discoverTimer);
    if (this.dirPoll) clearInterval(this.dirPoll);
    this.pollTimer = this.discoverTimer = this.dirPoll = null;
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
    for (const f of this.files.values()) if (f.graceTimer) clearTimeout(f.graceTimer);
    let timer: NodeJS.Timeout | undefined;
    await Promise.race([
      this.queue.catch(() => undefined),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, STOP_WAIT_MS);
      }),
    ]);
    if (timer) clearTimeout(timer);
  }

  /** Test helper: resolves when the work queued so far finished. */
  async idle(): Promise<void> {
    await this.queue;
  }

  // --- Watching -------------------------------------------------------------------------

  private attachWatcher(): void {
    const dir = this.options.projectsDir;
    if (!existsSync(dir)) {
      // ~/.claude/projects may not exist yet: look again later.
      this.dirPoll ??= setInterval(() => {
        if (this.stopped || !existsSync(dir)) return;
        if (this.dirPoll) clearInterval(this.dirPoll);
        this.dirPoll = null;
        this.attachWatcher();
        void this.enqueue(() => this.walk(false));
      }, 5000);
      this.dirPoll.unref();
      return;
    }
    try {
      this.fsWatcher = watch(dir, { recursive: true, persistent: false }, (_event, filename) => {
        if (filename === null || this.stopped) return;
        this.schedule(join(dir, String(filename)));
      });
      this.fsWatcher.on('error', () => {
        this.stat.errors++;
        this.fsWatcher?.close();
        this.fsWatcher = null; // the periodic walk keeps working
      });
    } catch {
      this.stat.errors++;
      this.fsWatcher = null;
    }
  }

  private schedule(path: string): void {
    if (!path.endsWith('.jsonl') && !path.endsWith('.meta.json')) return;
    if (this.timers.has(path)) return;
    const timer = setTimeout(() => {
      this.timers.delete(path);
      void this.enqueue(() => this.onPath(path, false));
    }, DEBOUNCE_MS);
    timer.unref();
    this.timers.set(path, timer);
  }

  private pollTracked(): void {
    const t = this.now();
    const inactivityMs = this.options.inactivityStopMs ?? 120_000;
    for (const [path, f] of this.files) {
      const idle = t - f.lastActivity > IDLE_UNTRACK_MS;
      if (idle && (f.stopped || !f.tracked || f.kind === 'main')) {
        // Prune: finished, abandoned or long-idle files must not accumulate forever.
        this.files.delete(path);
        this.ingestor.forget(path);
        continue;
      }
      if (!f.tracked || f.stopped) continue;
      if (f.kind === 'sub' && f.started && t - f.lastActivity >= inactivityMs) {
        void this.enqueue(() => this.syntheticStop(f));
        continue;
      }
      this.schedule(path);
    }
  }

  /** A subagent that went silent without a `finished` meta (crash/kill): close it (CA-18). */
  private async syntheticStop(state: FileState): Promise<void> {
    if (state.stopped || !state.started) return;
    const inactivityMs = this.options.inactivityStopMs ?? 120_000;
    await this.drain(state); // late lines count as activity
    if (this.now() - state.lastActivity < inactivityMs) return;
    state.stopped = true;
    state.tracked = false;
    this.ingestor.forget(state.path);
    this.stat.syntheticStops++;
    this.emitEvent({ kind: 'subagent.stop', state });
  }

  private enqueue(task: () => Promise<void>): Promise<void> {
    const run = this.queue.then(async () => {
      if (this.stopped) return;
      try {
        await task();
      } catch {
        this.stat.errors++; // a vanished file or a permission error: next pass retries
      }
    });
    this.queue = run;
    return run;
  }

  /** Walks the projects tree (project slug / session / subagents) for recent files. */
  private async walk(initial: boolean): Promise<void> {
    const root = this.options.projectsDir;
    const cutoff = this.now() - this.activeMs;
    let slugs;
    try {
      slugs = await readdir(root, { withFileTypes: true });
    } catch {
      return;
    }
    for (const slug of slugs) {
      if (!slug.isDirectory()) continue;
      const slugDir = join(root, slug.name);
      let entries;
      try {
        entries = await readdir(slugDir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        const path = join(slugDir, entry.name);
        if (entry.isFile() && SESSION_FILE_RE.test(entry.name)) {
          if (await this.isRecent(path, cutoff)) await this.onPath(path, initial);
        } else if (entry.isDirectory()) {
          const mainRecent = await this.isRecent(join(slugDir, `${entry.name}.jsonl`), cutoff);
          const dirRecent = mainRecent || (await this.isRecent(path, cutoff));
          if (dirRecent) await this.walkSubagents(join(path, 'subagents'), initial, cutoff);
        }
      }
    }
  }

  private async walkSubagents(dir: string, initial: boolean, cutoff: number): Promise<void> {
    let names: string[];
    try {
      names = await readdir(dir);
    } catch {
      return;
    }
    // Meta files first, so the type is known when the transcript is adopted.
    names.sort((a, b) => Number(b.endsWith('.meta.json')) - Number(a.endsWith('.meta.json')));
    for (const name of names) {
      const path = join(dir, name);
      if (name.endsWith('.meta.json') || name.endsWith('.jsonl')) {
        if (await this.isRecent(path, cutoff)) await this.onPath(path, initial);
      }
    }
  }

  private async isRecent(path: string, cutoff: number): Promise<boolean> {
    const t = this.now();
    if ((this.oldUntil.get(path) ?? 0) > t) return false; // known old: skip the stat
    try {
      const recent = (await stat(path)).mtimeMs >= cutoff;
      if (!recent) {
        if (this.oldUntil.size >= MAX_OLD_CACHE) this.oldUntil.clear();
        this.oldUntil.set(path, t + OLD_FILE_CACHE_MS);
      }
      return recent;
    } catch {
      return false;
    }
  }

  // --- Per-file handling ----------------------------------------------------------------

  private async onPath(path: string, initial: boolean): Promise<void> {
    const rel = relative(this.options.projectsDir, path);
    if (rel.startsWith('..')) return;
    const parts = rel.split(sep);
    const sub = parseSubagentPath(path);
    if (sub && parts.length >= 4) {
      if (sub.kind === 'prefix') return;
      if (sub.kind === 'meta') await this.onMeta(path, sub.sessionId, sub.agentId, initial);
      else await this.onSubTranscript(path, sub.sessionId, sub.agentId, initial);
      return;
    }
    const m = parts.length === 2 ? SESSION_FILE_RE.exec(parts[1] ?? '') : null;
    if (m?.[1]) await this.onMain(path, m[1], initial);
  }

  private state(path: string, init: () => FileState): FileState {
    let s = this.files.get(path);
    if (!s) {
      s = init();
      this.files.set(path, s);
    }
    return s;
  }

  private async onMain(path: string, sessionId: string, initial: boolean): Promise<void> {
    const state = this.state(path, () => this.newState(path, 'main', sessionId));
    if (!state.tracked) {
      const st = await stat(path).catch(() => null);
      if (!st) return;
      const isNew = !initial && st.birthtimeMs >= this.startedAt - 1000;
      if (!isNew) await this.ingestor.tailer.attachAtEnd(path);
      state.tracked = true;
      state.started = true;
      state.fromStart = isNew;
      if (!isNew) return;
    }
    await this.drain(state);
  }

  private async onSubTranscript(
    path: string,
    sessionId: string,
    agentId: string,
    initial: boolean,
  ): Promise<void> {
    const state = this.state(path, () => {
      const s = this.newState(path, 'sub', sessionId);
      s.agentId = agentId;
      s.metaPath = join(path, '..', `agent-${agentId}.meta.json`);
      return s;
    });
    if (state.stopped) return;
    if (!state.tracked) {
      const st = await stat(path).catch(() => null);
      if (!st) return;
      state.tracked = true;
      const meta = await this.readMeta(state);
      if (initial) {
        // Adopt a subagent that is running right now; never replay finished ones.
        if (meta.finished === true) {
          state.stopped = true;
          state.tracked = false;
          return;
        }
        await this.ingestor.tailer.attachAtEnd(path);
        state.fromStart = false;
        this.learnProject(state, await this.peekCwd(path));
        this.emitStart(state, meta.agentType);
        return;
      }
      state.fromStart = true;
    }
    await this.drain(state);
    if (!state.started && state.agentType) this.ensureStarted(state);
    if (!state.started) this.armGrace(state);
    await this.maybeStop(state);
  }

  private async onMeta(
    path: string,
    sessionId: string,
    agentId: string,
    initial: boolean,
  ): Promise<void> {
    const transcript = join(path, '..', `agent-${agentId}.jsonl`);
    const state = this.files.get(transcript);
    if (!state) {
      // The transcript was not seen yet (or is history): its own event handles the adoption.
      if (!initial && existsSync(transcript))
        await this.onSubTranscript(transcript, sessionId, agentId, false);
      return;
    }
    if (state.stopped) return;
    const meta = await this.readMeta(state);
    if (!state.started && meta.agentType) {
      // The type is known: no need to wait for the grace period.
      await this.drain(state);
      this.ensureStarted(state);
    }
    await this.maybeStop(state);
  }

  private async maybeStop(state: FileState): Promise<void> {
    if (state.kind !== 'sub' || state.stopped || !state.metaPath) return;
    const meta = await this.readMeta(state);
    if (meta.finished !== true) return;
    await this.drain(state); // flush the tool uses written before the end
    this.ensureStarted(state);
    state.stopped = true;
    state.tracked = false;
    this.ingestor.forget(state.path);
    this.emitEvent({ kind: 'subagent.stop', state });
  }

  private armGrace(state: FileState): void {
    if (state.graceTimer || state.started) return;
    const wait = Math.max(0, state.firstSeen + this.graceMs - this.now());
    state.graceTimer = setTimeout(() => {
      state.graceTimer = undefined;
      void this.enqueue(async () => {
        if (state.started || state.stopped) return;
        await this.drain(state);
        this.ensureStarted(state);
      });
    }, wait + 5);
    state.graceTimer.unref();
  }

  private newState(path: string, kind: 'main' | 'sub', sessionId: string): FileState {
    return {
      path,
      kind,
      sessionId,
      firstSeen: this.now(),
      tracked: false,
      started: false,
      stopped: false,
      fromStart: true,
      pending: [],
      lastActivity: this.now(),
    };
  }

  private async readMeta(state: FileState): Promise<ReturnType<typeof parseSubagentMeta>> {
    if (!state.metaPath) return {};
    try {
      const meta = parseSubagentMeta(await readFile(state.metaPath, 'utf8'));
      if (meta.agentType) state.agentType = meta.agentType;
      return meta;
    } catch {
      return {};
    }
  }

  /** First `cwd` of a file (cheap: the head only); used when adopting a running subagent. */
  private async peekCwd(path: string): Promise<string | undefined> {
    try {
      const tailer = new JsonlTailer(nodeTailFs, { maxBytesPerPoll: 64 * 1024 });
      const ingest = new JsonlIngestor(tailer);
      const poll = await ingest.poll(path);
      return poll.records.find((r) => r.record.cwd)?.record.cwd;
    } catch {
      return undefined;
    }
  }

  private learnProject(state: FileState, cwd: string | undefined): void {
    if (!cwd) return;
    const project = cwdToProject(cwd, this.options.devRoot, this.options.project);
    this.projectBySession.delete(state.sessionId);
    this.projectBySession.set(state.sessionId, project);
    if (this.projectBySession.size > MAX_SESSION_PROJECTS) {
      const oldest = this.projectBySession.keys().next().value;
      if (oldest !== undefined) this.projectBySession.delete(oldest);
    }
  }

  /** Reads what was appended and turns it into events (buffering until a subagent started). */
  private async drain(state: FileState): Promise<void> {
    if (state.stopped) return;
    let more = true;
    while (more) {
      const poll = await this.ingestor.poll(state.path);
      more = poll.more;
      this.stat.ignoredLines += poll.ignoredLines;
      if (poll.gone) {
        state.tracked = false;
        return;
      }
      if (poll.records.length > 0) state.lastActivity = this.now();
      for (const rec of poll.records) {
        this.learnProject(state, rec.record.cwd);
        if (state.kind === 'sub' && !state.started) {
          if (state.pending.length < MAX_PENDING_RECORDS) state.pending.push(rec);
        } else {
          this.emitRecord(state, rec);
        }
      }
    }
  }

  private ensureStarted(state: FileState): void {
    if (state.started || state.stopped) return;
    this.emitStart(state, state.agentType ?? undefined);
  }

  private emitStart(state: FileState, agentType: string | undefined): void {
    if (state.started) return;
    state.started = true;
    if (state.graceTimer) clearTimeout(state.graceTimer);
    state.graceTimer = undefined;
    if (agentType) state.agentType = agentType;
    this.emitEvent({ kind: 'subagent.start', state });
    const buffered = state.pending.splice(0);
    for (const rec of buffered) this.emitRecord(state, rec);
  }

  private emitRecord(state: FileState, rec: IngestedRecord): void {
    const a = rec.record.assistant;
    if (!a) return;
    const ts = rec.record.timestamp;
    for (const use of a.toolUses) {
      this.emitEvent({
        kind: 'tool.pre',
        state,
        ...(ts !== undefined ? { ts } : {}),
        tool: {
          name: use.name,
          category: categorizeTool(use.name),
          ...(use.id ? { useId: use.id } : {}),
        },
      });
    }
    if (state.kind === 'main' && a.stopReason === 'end_turn') {
      this.emitEvent({ kind: 'turn.stop', state, ...(ts !== undefined ? { ts } : {}) });
    }
  }

  private emitEvent(init: {
    kind: OfficeEvent['kind'];
    state: FileState;
    ts?: number;
    tool?: { name: string; category: ReturnType<typeof categorizeTool>; useId?: string };
  }): void {
    const { state } = init;
    const event = this.options.makeEvent({
      source: 'jsonl',
      kind: init.kind,
      ...(init.ts !== undefined ? { ts: init.ts } : {}),
      sessionId: state.sessionId,
      project: this.projectBySession.get(state.sessionId) ?? { kind: 'unknown' },
      agentType: state.kind === 'sub' ? (state.agentType ?? 'unknown') : null,
      agentId: state.kind === 'sub' ? (state.agentId ?? null) : null,
      ...(init.tool ? { tool: init.tool } : {}),
    });
    this.stat.eventsEmitted++;
    try {
      this.options.emit(event);
    } catch {
      this.stat.errors++;
    }
  }
}

/** Default location: `~/.claude/projects`. */
export function defaultProjectsDir(claudeHome: string): string {
  return join(claudeHome, 'projects');
}
