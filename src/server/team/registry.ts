import type { Diagnostic, Escritorio, TeamView } from '../../shared/contracts';
import { checkConsistency, parseMapIndex } from './consistency';
import type { MapIndex } from './consistency';
import { diag, toPublicDiagnostic } from './diagnostics';
import type { TeamDiagnostic } from './diagnostics';
import { toTeamDiffEvent } from './diff';
import type { TeamDiffEvent } from './diff';
import { buildFallbackView } from './fallback';
import { parseQuadro } from './quadro';
import type { QuadroAgent } from './quadro';
import { resolveAgent } from './resolve';
import type { AgentIdentity, ResolvedAgent } from './resolve';
import { configToView, parseEscritorioText } from './validate';

// TeamRegistry (T-20): loads/validates escritorio.json, keeps the last valid one, falls back
// to a team derived from QUADRO.md and emits changes (with the `team.diff` event).
// All I/O goes through injected dependencies (file reader, watcher, clock, sleep).

export type TeamSource = 'escritorio' | 'last-valid' | 'quadro-fallback';

export interface TeamSnapshot {
  view: TeamView;
  /** Parsed config when `source` is escritorio/last-valid; null for the QUADRO fallback. */
  config: Escritorio | null;
  source: TeamSource;
  diagnostics: TeamDiagnostic[];
  loadedAt: number;
}

export interface TeamChange {
  snapshot: TeamSnapshot;
  /** null when the roster did not change (or on a no-op reload). */
  diff: TeamDiffEvent | null;
  /** true when the view or the diagnostics differ from the previous snapshot. */
  changed: boolean;
}

export interface TeamWatcher {
  /** Calls `onChange` (debounced by the adapter) when any of the files changes. Returns a closer. */
  watch(paths: readonly string[], onChange: () => void): () => void;
}

export interface TeamRegistryDeps {
  escritorioPath: string;
  quadroPath: string;
  /** Returns the text, or null when the file does not exist. Other errors may throw. */
  readText: (path: string) => Promise<string | null>;
  /** Optional: JSON of mapa.json for the cross-file check (null/undefined = skip). */
  readMapJson?: () => Promise<unknown | null>;
  watcher?: TeamWatcher;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** Delay before re-reading a file that failed to parse (it may be mid-write). Default 300. */
  retryDelayMs?: number;
}

type Listener = (change: TeamChange) => void;

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class TeamRegistry {
  private readonly deps: TeamRegistryDeps;
  private current: TeamSnapshot | null = null;
  private lastValid: { config: Escritorio; view: TeamView } | null = null;
  private readonly listeners = new Set<Listener>();
  private closeWatch: (() => void) | null = null;
  private inFlight: Promise<TeamChange> | null = null;
  private rerun = false;

  constructor(deps: TeamRegistryDeps) {
    this.deps = deps;
  }

  get snapshot(): TeamSnapshot | null {
    return this.current;
  }

  /** Current view; throws if `load()` was never awaited. */
  get view(): TeamView {
    if (!this.current) throw new Error('TeamRegistry not loaded');
    return this.current.view;
  }

  /** Public diagnostics (without internal codes) for the UI/WS `diag` message. */
  get publicDiagnostics(): Diagnostic[] {
    return (this.current?.diagnostics ?? []).map(toPublicDiagnostic);
  }

  resolve(ident: AgentIdentity): ResolvedAgent {
    return resolveAgent(this.view, ident);
  }

  onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Loads now and starts watching the files (if a watcher was provided). */
  async start(): Promise<TeamChange> {
    const first = await this.load();
    const { watcher, escritorioPath, quadroPath } = this.deps;
    if (watcher && !this.closeWatch) {
      this.closeWatch = watcher.watch([escritorioPath, quadroPath], () => {
        void this.load();
      });
    }
    return first;
  }

  stop(): void {
    this.closeWatch?.();
    this.closeWatch = null;
  }

  /** (Re)loads the files. Concurrent calls coalesce: at most one extra pass is queued. */
  load(): Promise<TeamChange> {
    if (this.inFlight) {
      this.rerun = true;
      return this.inFlight;
    }
    const run = async (): Promise<TeamChange> => {
      let change = await this.loadOnce();
      while (this.rerun) {
        this.rerun = false;
        change = await this.loadOnce();
      }
      return change;
    };
    this.inFlight = run().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async readWithRetry(
    path: string,
  ): Promise<{ text: string | null; parse: ReturnType<typeof parseEscritorioText> | null }> {
    const sleep = this.deps.sleep ?? defaultSleep;
    let text = await this.safeRead(path);
    if (text === null) return { text: null, parse: null };
    let parse = parseEscritorioText(text);
    if (!parse.ok) {
      // The file may be mid-write: read once more after a short delay (ADR-0006).
      await sleep(this.deps.retryDelayMs ?? 300);
      const again = await this.safeRead(path);
      if (again !== null && again !== text) {
        text = again;
        parse = parseEscritorioText(again);
      }
    }
    return { text, parse };
  }

  private async safeRead(path: string): Promise<string | null> {
    try {
      return await this.deps.readText(path);
    } catch {
      return null;
    }
  }

  private async loadOnce(): Promise<TeamChange> {
    const now = (this.deps.now ?? Date.now)();
    const diagnostics: TeamDiagnostic[] = [];

    const quadroText = await this.safeRead(this.deps.quadroPath);
    let quadro: QuadroAgent[] | null = null;
    if (quadroText === null) {
      diagnostics.push(
        diag('quadro.file-missing', 'QUADRO.md', 'QUADRO.md not found', { severity: 'warning' }),
      );
    } else {
      const q = parseQuadro(quadroText);
      quadro = q.agents;
      diagnostics.push(...q.diagnostics);
    }

    const { text, parse } = await this.readWithRetry(this.deps.escritorioPath);
    let snapshot: TeamSnapshot;

    if (text === null || parse === null) {
      diagnostics.unshift(
        diag('team.file-missing', 'escritorio.json', 'escritorio.json not found', {
          severity: 'error',
        }),
      );
      snapshot = this.fallbackSnapshot(quadro, diagnostics, now);
    } else if (!parse.ok) {
      diagnostics.unshift(...parse.diagnostics);
      snapshot = this.fallbackSnapshot(quadro, diagnostics, now);
    } else {
      const config = parse.config;
      const map = await this.loadMap(diagnostics);
      // Cross-file findings do not invalidate the file: the engine falls back per agent.
      for (const d of checkConsistency({ quadro, escritorio: config, map })) {
        diagnostics.push({ ...d, severity: 'warning' });
      }
      const view = configToView(config);
      this.lastValid = { config, view };
      snapshot = { view, config, source: 'escritorio', diagnostics, loadedAt: now };
    }
    return this.commit(snapshot, now);
  }

  private async loadMap(diagnostics: TeamDiagnostic[]): Promise<MapIndex | null> {
    if (!this.deps.readMapJson) return null;
    try {
      const raw = await this.deps.readMapJson();
      if (raw === null) return null;
      const index = parseMapIndex(raw);
      if (!index)
        diagnostics.push(
          diag('map.unreadable', 'mapa.json', 'mapa.json has no usable rooms/desks', {
            severity: 'warning',
          }),
        );
      return index;
    } catch {
      diagnostics.push(
        diag('map.unreadable', 'mapa.json', 'mapa.json could not be read', { severity: 'warning' }),
      );
      return null;
    }
  }

  private fallbackSnapshot(
    quadro: QuadroAgent[] | null,
    diagnostics: TeamDiagnostic[],
    now: number,
  ): TeamSnapshot {
    if (this.lastValid) {
      diagnostics.push(
        diag(
          'team.keeping-last-valid',
          'escritorio.json',
          'keeping the last valid escritorio.json',
          { severity: 'info' },
        ),
      );
      return {
        view: this.lastValid.view,
        config: this.lastValid.config,
        source: 'last-valid',
        diagnostics,
        loadedAt: now,
      };
    }
    diagnostics.push(
      diag(
        'team.using-quadro-fallback',
        'QUADRO.md',
        'using a minimal team derived from QUADRO.md',
        { severity: 'info' },
      ),
    );
    return {
      view: buildFallbackView(quadro ?? []),
      config: null,
      source: 'quadro-fallback',
      diagnostics,
      loadedAt: now,
    };
  }

  private commit(next: TeamSnapshot, now: number): TeamChange {
    const prev = this.current;
    const viewChanged = prev === null || JSON.stringify(prev.view) !== JSON.stringify(next.view);
    const diagChanged =
      prev === null || JSON.stringify(prev.diagnostics) !== JSON.stringify(next.diagnostics);
    // Keep the previous object when nothing changed so `loadedAt` does not churn.
    if (prev !== null && !viewChanged && !diagChanged)
      return { snapshot: prev, diff: null, changed: false };
    this.current = next;
    const diff = viewChanged ? toTeamDiffEvent(prev?.view ?? null, next.view, now) : null;
    const change: TeamChange = { snapshot: next, diff, changed: true };
    for (const l of this.listeners) {
      try {
        l(change);
      } catch {
        // A faulty listener must not break the registry.
      }
    }
    return change;
  }
}
