import { homedir } from 'node:os';
import { join } from 'node:path';
import type {
  ActivityItem,
  DiagResponseSchema,
  Diagnostic,
  NpcLogical,
  OfficeSnapshot,
  ProjectSummary,
} from '../../shared/contracts';
import { EventBus } from '../../shared/events';
import type { BuildAppOptions, ServerContext } from '../app';
import { findProjectRoot } from '../config';
import { registerHookRoutes } from '../http/routes/hooks';
import { registerStateRoutes } from '../http/routes/state';
import { IngestService } from '../ingest';
import { JsonlWatcher } from '../jsonl/watcher';
import {
  detectInstalled,
  hookRuntimeSourceDir,
  inspectHookInstall,
  parseSettingsText,
  readTextOrNull as readSettingsText,
  defaultUserSettingsPath,
} from '../settings-installer';
import { createFsTeamWatcher, readTextOrNull, TeamRegistry } from '../team';
import { OfficeState, type StateChange } from './state';
import type { z } from 'zod';

// Wires the office together (T-16/T-19/T-21): TeamRegistry (read-only), EventBus, HookIngest,
// JsonlWatcher (Level 0 fallback), OfficeState, and the publication to the WS hub.

export type DiagResponse = z.infer<typeof DiagResponseSchema>;

export interface OfficeModuleOptions {
  /** `~/.claude` (default: ESCRITORIO_CLAUDE_HOME or `%USERPROFILE%\.claude`). */
  claudeHome?: string;
  /** Directory with `escritorio.json` and `QUADRO.md` (default `<claudeHome>/equipe`). Read-only. */
  teamDir?: string;
  /** Default `<claudeHome>/projects`. */
  projectsDir?: string;
  /** `assets/map/mapa.json` (default: the one in this repository; `null` = skip the cross check). */
  mapPath?: string | null;
  /** The user's settings.json, READ ONLY to detect the installed level. */
  userSettingsPath?: string;
  /** Watch `~/.claude/projects` (default true). */
  watchJsonl?: boolean;
  /** Test knobs. */
  jsonl?: { metaGraceMs?: number; pollMs?: number; discoverMs?: number; activeWindowMs?: number };
  sweepMs?: number;
  flushMs?: number;
}

const DIAG_CACHE_MS = 10_000;

class Publisher {
  private npcs = new Map<string, NpcLogical>();
  private removed = new Set<string>();
  private activity: ActivityItem[] = [];
  private projects = new Map<string, ProjectSummary>();
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly send: (message: Parameters<ServerContext['hub']['broadcast']>[0]) => void,
    private readonly delayMs: number,
  ) {}

  push(change: StateChange): void {
    if (change.type === 'npc') {
      this.npcs.set(change.npc.key, change.npc);
      this.removed.delete(change.npc.key);
    } else if (change.type === 'npc.remove') {
      this.npcs.delete(change.key); // an update queued before the removal is moot
      this.removed.add(change.key);
    } else if (change.type === 'activity') this.activity.push(change.item);
    else this.projects.set(change.project.name, change.project);
    this.timer ??= setTimeout(() => this.flush(), this.delayMs);
    this.timer.unref();
  }

  flush(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const npcs = [...this.npcs.values()];
    const removed = [...this.removed];
    this.removed = new Set();
    const activity = this.activity;
    const projects = [...this.projects.values()];
    this.npcs = new Map();
    this.activity = [];
    this.projects = new Map();
    for (const npc of npcs) this.send({ t: 'npc.update', npc });
    for (const key of removed) this.send({ t: 'npc.remove', key });
    for (const item of activity) this.send({ t: 'activity', item });
    for (const project of projects) this.send({ t: 'project.upsert', project });
  }

  close(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}

export class OfficeService {
  readonly bus: EventBus;
  readonly ingest: IngestService;
  readonly team: TeamRegistry;
  private stateRef: OfficeState | null = null;
  readonly jsonl: JsonlWatcher | null;
  private readonly publisher: Publisher;
  private sweepTimer: NodeJS.Timeout | null = null;
  private unsubscribers: Array<() => void> = [];
  private diagCache: {
    at: number;
    settingsLevel: number;
    hookInstalled: number;
    hookUpToDate: number;
  } | null = null;
  private readonly claudeHome: string;
  private readonly userSettingsPath: string;
  private readonly hookSourceDir: string | null;
  private readonly projectsDir: string;
  private readonly now = () => Date.now();

  constructor(
    private readonly ctx: ServerContext,
    private readonly options: OfficeModuleOptions = {},
  ) {
    this.claudeHome =
      options.claudeHome ??
      (process.env['ESCRITORIO_CLAUDE_HOME']?.trim() || join(homedir(), '.claude'));
    const teamDir = options.teamDir ?? join(this.claudeHome, 'equipe');
    this.projectsDir = options.projectsDir ?? join(this.claudeHome, 'projects');
    this.userSettingsPath =
      options.userSettingsPath ??
      (options.claudeHome ? join(this.claudeHome, 'settings.json') : defaultUserSettingsPath());
    this.hookSourceDir = hookRuntimeSourceDir();
    const mapPath =
      options.mapPath === undefined
        ? (() => {
            const root = findProjectRoot(import.meta.url);
            return root ? join(root, 'assets', 'map', 'mapa.json') : null;
          })()
        : options.mapPath;

    this.bus = new EventBus((err) =>
      ctx.app.log.warn({ errMessage: (err as Error)?.message }, 'event listener failed'),
    );
    this.team = new TeamRegistry({
      escritorioPath: join(teamDir, 'escritorio.json'),
      quadroPath: join(teamDir, 'QUADRO.md'),
      readText: readTextOrNull,
      ...(mapPath
        ? {
            readMapJson: async () => {
              const text = await readTextOrNull(mapPath);
              return text === null ? null : (JSON.parse(text) as unknown);
            },
          }
        : {}),
      watcher: createFsTeamWatcher(),
    });
    this.ingest = new IngestService({
      bus: this.bus,
      devRoot: ctx.env.devRoot,
      log: (info) => ctx.app.log.debug(info, 'event'),
    });
    this.publisher = new Publisher((m) => ctx.hub.broadcast(m), options.flushMs ?? 25);
    this.jsonl =
      options.watchJsonl === false
        ? null
        : new JsonlWatcher({
            projectsDir: this.projectsDir,
            devRoot: ctx.env.devRoot,
            makeEvent: this.ingest.makeEvent,
            emit: (event) => void this.ingest.ingestEvent(event),
            ...options.jsonl,
          });
  }

  /** The office state; exists once `start()` loaded the team. */
  get state(): OfficeState {
    if (!this.stateRef) throw new Error('office service not started');
    return this.stateRef;
  }

  async start(): Promise<void> {
    await this.team.start();
    const state = new OfficeState({
      team: this.team,
      config: () => this.ctx.config.get(),
      extraDiagnostics: () => this.extraDiagnostics(),
    });
    this.stateRef = state;
    this.unsubscribers.push(
      state.onChange((change) => this.publisher.push(change)),
      this.bus.on((event) => state.apply(event)),
      this.team.onChange(() => {
        state.onTeamChange();
        this.ctx.hub.broadcast({ t: 'team', team: this.team.view });
        this.ctx.hub.broadcast({ t: 'diag', diagnostics: this.team.publicDiagnostics });
      }),
    );
    this.sweepTimer = setInterval(() => state.sweep(), this.options.sweepMs ?? 2000);
    this.sweepTimer.unref();
    await this.jsonl?.start();
  }

  async stop(): Promise<void> {
    await this.jsonl?.stop();
    this.team.stop();
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    this.sweepTimer = null;
    for (const off of this.unsubscribers) off();
    this.unsubscribers = [];
    this.publisher.close();
  }

  snapshot(): OfficeSnapshot {
    return this.state.snapshot();
  }

  private extraDiagnostics(): Diagnostic[] {
    const out: Diagnostic[] = [];
    if (this.jsonl && !this.jsonl.stats().watching) {
      out.push({
        code: 'jsonl.watcher-inactive',
        file: 'projects',
        message: 'JSONL fallback watcher is not active (folder missing or unreadable)',
        severity: 'info',
      });
    }
    if (this.stateRef && this.stateRef.counters.droppedFreelancers > 0) {
      out.push({
        code: 'office.freelancer-limit',
        params: { dropped: String(this.stateRef.counters.droppedFreelancers) },
        file: 'office',
        message: `Freelancer limit reached: ${this.stateRef.counters.droppedFreelancers} event(s) from unknown agents were dropped`,
        severity: 'warning',
      });
    }
    return out;
  }

  /** Counters only, never content (ARQUITETURA §12). */
  async diag(): Promise<DiagResponse> {
    const now = this.now();
    if (!this.diagCache || now - this.diagCache.at > DIAG_CACHE_MS) {
      const text = await readSettingsText(this.userSettingsPath).catch(() => null);
      const parsed = text === null ? null : parseSettingsText(text);
      const level = parsed?.ok ? detectInstalled(parsed.value).level : 0;
      const hook = await inspectHookInstall(this.ctx.env.paths, this.hookSourceDir);
      this.diagCache = {
        at: now,
        settingsLevel: level,
        hookInstalled: hook.installed ? 1 : 0,
        hookUpToDate: hook.upToDate ? 1 : 0,
      };
    }
    const latency = this.ingest.latency();
    const jsonl = this.jsonl?.stats();
    const counters: Record<string, number> = {
      ...this.ingest.counters.toRecord(),
      'ingest.latencyMs.p50': latency.p50,
      'ingest.latencyMs.p95': latency.p95,
      'ingest.listenerErrors': this.bus.listenerErrors,
      'office.events': this.state.counters.events,
      'office.orphanStops': this.state.counters.orphanStops,
      'office.expiredInstances': this.state.counters.expiredInstances,
      'office.expiredAwaiting': this.state.counters.expiredAwaiting,
      'office.droppedFreelancers': this.state.counters.droppedFreelancers,
      'office.liveInstances': this.state.liveInstanceCount(),
      'office.activeSessions': this.state.activeSessionCount(),
      'settings.level': this.diagCache.settingsLevel,
      'hook.installed': this.diagCache.hookInstalled,
      'hook.upToDate': this.diagCache.hookUpToDate,
    };
    if (jsonl) {
      counters['jsonl.watching'] = jsonl.watching ? 1 : 0;
      counters['jsonl.trackedFiles'] = jsonl.trackedFiles;
      counters['jsonl.events'] = jsonl.eventsEmitted;
      counters['jsonl.ignoredLines'] = jsonl.ignoredLines;
      counters['jsonl.errors'] = jsonl.errors;
    }
    return { counters, clients: this.ctx.hub.clientCount() };
  }
}

/**
 * Options to pass to `startServer`/`buildApp`: the real snapshot, the hook ingest route and the
 * state routes, plus the watchers' lifecycle (closed with the app).
 */
export function officeServerOptions(
  options: OfficeModuleOptions = {},
): Pick<BuildAppOptions, 'snapshot' | 'extraRoutes'> & { service: () => OfficeService | null } {
  let service: OfficeService | null = null;
  return {
    service: () => service,
    snapshot: () => {
      if (!service) throw new Error('office service not started');
      return service.snapshot();
    },
    extraRoutes: async (ctx) => {
      const office = new OfficeService(ctx, options);
      await office.start();
      service = office;
      await registerHookRoutes(ctx.app, { ingest: office.ingest });
      registerStateRoutes(ctx.app, { office });
      ctx.app.addHook('onClose', async () => {
        await office.stop();
      });
    },
  };
}
