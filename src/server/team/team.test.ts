import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DiagnosticSchema, EscritorioSchema, TeamViewSchema } from '../../shared/contracts';
import type { Escritorio, TeamView } from '../../shared/contracts';
import { checkConsistency, parseMapIndex } from './consistency';
import { diffTeams, TeamDiffEventSchema, toTeamDiffEvent } from './diff';
import { buildFallbackView } from './fallback';
import { parseQuadro } from './quadro';
import { TeamRegistry } from './registry';
import type { TeamWatcher } from './registry';
import { findPromotedFreelancers, resolveAgent } from './resolve';
import { configToView, parseEscritorioText } from './validate';

const fixtures = join(import.meta.dirname, '..', '..', '..', 'tests', 'fixtures');
const read = (...p: string[]) => readFileSync(join(fixtures, ...p), 'utf8');
const proposalText = read('escritorio', 'proposta.valid.json');
const quadroText = read('team', 'QUADRO.sample.md');
const mapIndex = parseMapIndex(JSON.parse(read('team', 'mapa-index.json')));

function proposal(): Escritorio {
  return EscritorioSchema.parse(JSON.parse(proposalText));
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mutated(fn: (raw: any) => void): string {
  const raw = JSON.parse(proposalText);
  fn(raw);
  return JSON.stringify(raw);
}

describe('QUADRO.md reader and fallback (CA-13)', () => {
  it('CA-13: QUADRO.md yields the 16 minimum agents with nicknames', () => {
    const q = parseQuadro(quadroText);
    expect(q.diagnostics).toEqual([]);
    expect(q.agents).toHaveLength(16);
    expect(q.agents[0]).toMatchObject({ agentType: 'chefe', nickname: 'Chefe' });
    expect(q.agents.find((a) => a.agentType === 'dev-backend')?.nickname).toBe('Bruno');
  });

  it('CA-13: the reserve team has 16 agents on provisional desks, valid for the public TeamView', () => {
    const view = buildFallbackView(parseQuadro(quadroText).agents);
    expect(TeamViewSchema.safeParse(view).success).toBe(true);
    expect(view.source).toBe('quadro-fallback');
    expect(view.agents).toHaveLength(16);
    expect(view.agents.every((a) => a.desk === null && a.provisional === true)).toBe(true);
    expect(view.agents.filter((a) => a.isLead).map((a) => a.agentType)).toEqual(['chefe']);
    expect(view.agents.find((a) => a.agentType === 'dev-web')?.department).toBe('engenharia');
    expect(view.agents.find((a) => a.agentType === 'pesquisador')?.department).toBe('biblioteca');
  });

  it('CA-13: garbage QUADRO never throws and reports a diagnostic', () => {
    const q = parseQuadro('| not | a | table\n\u0000\u0001{{{');
    expect(q.agents).toEqual([]);
    expect(q.diagnostics.map((d) => d.code)).toContain('quadro.no-agents');
    expect(buildFallbackView(q.agents).agents.map((a) => a.agentType)).toEqual(['chefe']);
  });

  it('CA-13: duplicate and invalid rows are reported, not fatal', () => {
    const md = [
      '## Equipe ativa',
      '| Agente | Apelido | Fase | Função |',
      '|---|---|---|---|',
      '| chefe | Chefe | Todas | x |',
      '| chefe | Outro | Todas | x |',
      '| Nome Invalido! | X | Apoio | x |',
      '| dev-web | Lívia | Construir | x |',
    ].join('\n');
    const q = parseQuadro(md);
    expect(q.agents.map((a) => a.agentType)).toEqual(['chefe', 'dev-web']);
    expect(q.diagnostics.map((d) => d.code).sort()).toEqual([
      'quadro.agent-duplicate',
      'quadro.row-invalid',
    ]);
  });
});

describe('escritorio.json validation (CA-13)', () => {
  it('CA-12: the approved proposal is valid and keeps 16 NPCs', () => {
    const r = parseEscritorioText(proposalText);
    expect(r.ok).toBe(true);
    if (r.ok) expect(configToView(r.config).agents).toHaveLength(16);
  });

  it('CA-13: invalid JSON gives a diagnostic naming the file', () => {
    const r = parseEscritorioText('{ "schema": "escritorio/v1", ');
    expect(r.ok).toBe(false);
    expect(r.diagnostics[0]).toMatchObject({
      code: 'team.json-invalid',
      file: 'escritorio.json',
      severity: 'error',
    });
  });

  it('CA-13: a missing required field is reported with its path', () => {
    const r = parseEscritorioText(mutated((raw) => delete raw.agents[3].nickname));
    expect(r.ok).toBe(false);
    const d = r.diagnostics.find((x) => x.path === 'agents.3.nickname');
    expect(d).toBeDefined();
    expect(d?.file).toBe('escritorio.json');
    expect(d?.params?.field).toBe('agents.3.nickname');
  });

  it('CA-13: wrong schema value and wrong type are reported', () => {
    const r = parseEscritorioText(
      mutated((raw) => ((raw.schema = 'escritorio/v9'), (raw.agents[0].desk = 7))),
    );
    expect(r.ok).toBe(false);
    const paths = r.diagnostics.map((d) => d.path);
    expect(paths).toContain('schema');
    expect(paths).toContain('agents.0.desk');
  });

  it('CA-13: duplicate desk and unknown department get stable codes', () => {
    const dupDesk = parseEscritorioText(
      mutated((raw) => (raw.agents[2].desk = raw.agents[1].desk)),
    );
    expect(dupDesk.diagnostics.map((d) => d.code)).toContain('team.desk-duplicate');
    const badDept = parseEscritorioText(
      mutated((raw) => (raw.agents[2].department = 'inexistente')),
    );
    expect(badDept.diagnostics.find((d) => d.code === 'team.department-unknown')?.path).toBe(
      'agents.2.department',
    );
  });

  it('CA-13: oversized input is rejected without parsing', () => {
    const r = parseEscritorioText('x'.repeat(1024 * 1024 + 1));
    expect(r.diagnostics[0]?.code).toBe('team.file-too-large');
  });
});

describe('agent_type resolution (CA-17)', () => {
  const view = configToView(proposal());

  it('CA-17: a known agent_type resolves to its fixed NPC', () => {
    const r = resolveAgent(view, { agentType: 'dev-web', agentId: 'a1' });
    expect(r).toMatchObject({ kind: 'fixed', key: 'dev-web' });
    if (r.kind === 'fixed') expect(r.agent.nickname).toBe('Lívia');
  });

  it('CA-17: an unknown agent_type becomes a Freelancer keyed by agent_id', () => {
    expect(resolveAgent(view, { agentType: 'general-purpose', agentId: 'abc123' })).toEqual({
      kind: 'freelancer',
      key: 'freelancer:abc123',
      agentType: 'general-purpose',
    });
    expect(resolveAgent(view, { agentType: 'novato' }).key).toBe('freelancer:novato');
  });

  it('CA-17: the main thread (no agent_type) is the lead', () => {
    for (const agentType of [null, undefined, '', '  ']) {
      const r = resolveAgent(view, { agentType });
      expect(r).toMatchObject({ kind: 'fixed', key: 'chefe' });
    }
  });

  it('CA-17: when the type is added to the team, active freelancers of it are promoted', () => {
    const next = proposal();
    const extra = {
      ...next.agents[1]!,
      agentType: 'novato',
      nickname: 'Nova',
      desk: null,
      provisional: true,
      isLead: false,
    };
    const nextView = configToView({ ...next, agents: [...next.agents, extra] });
    const active = [
      { key: 'freelancer:1', agentType: 'novato' },
      { key: 'freelancer:2', agentType: 'outro' },
    ];
    expect(findPromotedFreelancers(view, active)).toEqual([]);
    expect(findPromotedFreelancers(nextView, active).map((f) => f.key)).toEqual(['freelancer:1']);
    expect(resolveAgent(nextView, { agentType: 'novato', agentId: '1' }).kind).toBe('fixed');
  });
});

describe('team diff (CA-21)', () => {
  const base = configToView(proposal());

  it('CA-21: hire, dismissal and edit are detected; no change gives no event', () => {
    expect(toTeamDiffEvent(base, base, 1)).toBeNull();
    const cfg = proposal();
    const hired = {
      ...cfg.agents[1]!,
      agentType: 'novato',
      nickname: 'Nova',
      desk: null,
      provisional: true,
    };
    const edited = { ...cfg.agents[0]!, title: 'Outro cargo' };
    const next = configToView({ ...cfg, agents: [edited, ...cfg.agents.slice(2), hired] });
    const diff = diffTeams(base, next);
    expect(diff.added.map((a) => a.agentType)).toEqual(['novato']);
    expect(diff.removed.map((a) => a.agentType)).toEqual(['analista']);
    expect(diff.changed).toEqual([{ agentType: 'chefe', fields: ['title'] }]);
    expect(diff.provisionalAdded).toEqual(['novato']);
    const ev = toTeamDiffEvent(base, next, 99);
    expect(TeamDiffEventSchema.safeParse(ev).success).toBe(true);
    expect(ev).toMatchObject({ kind: 'team.diff', initial: false, ts: 99 });
  });

  it('CA-21: the first load is flagged initial so scenes do not play', () => {
    expect(toTeamDiffEvent(null, base, 1)?.initial).toBe(true);
  });
});

describe('consistency QUADRO x escritorio x mapa (CA-12, CA-21)', () => {
  const quadro = parseQuadro(quadroText).agents;
  const codes = (cfg: Escritorio, q = quadro, map = mapIndex) =>
    checkConsistency({ quadro: q, escritorio: cfg, map }).map((d) => d.code);

  it('CA-12: the proposal is consistent with QUADRO.md and the map index', () => {
    expect(mapIndex).not.toBeNull();
    expect(codes(proposal())).toEqual([]);
  });

  it('CA-21: agent without NPC and NPC without agent are reported', () => {
    expect(codes(proposal(), quadro.slice(0, 15))).toEqual(['team.npc-without-agent']);
    const cfg = proposal();
    const fewer = { ...cfg, agents: cfg.agents.filter((a) => a.agentType !== 'pentester') };
    expect(codes(fewer)).toEqual(['team.agent-without-npc']);
  });

  it('CA-21: a desk missing in the map and a desk in the wrong department are reported', () => {
    const cfg = proposal();
    const missing = {
      ...cfg,
      agents: cfg.agents.map((a) => (a.agentType === 'dev-web' ? { ...a, desk: 'ENG-99' } : a)),
    };
    expect(codes(missing)).toEqual(['team.desk-missing-in-map']);
    const wrong = {
      ...cfg,
      agents: cfg.agents.map((a) => (a.agentType === 'dev-web' ? { ...a, desk: 'PLN-01' } : a)),
    };
    // PLN-01 is also held by the analyst: the schema rejects that; use a free planning desk instead.
    expect(EscritorioSchema.safeParse(wrong).success).toBe(false);
    const wrong2 = {
      ...cfg,
      agents: cfg.agents.map((a) => (a.agentType === 'dev-web' ? { ...a, desk: 'FL-D1' } : a)),
    };
    expect(codes(wrong2)).toEqual(['team.desk-wrong-room']);
  });

  it('CA-21: a room of a department missing in the map is reported', () => {
    const cfg = proposal();
    const next = {
      ...cfg,
      departments: cfg.departments.map((d) =>
        d.id === 'entrega' ? { ...d, rooms: ['ENT', 'XXX'] } : d,
      ),
    };
    expect(codes(next)).toEqual(['team.room-missing-in-map']);
  });

  it('CA-21: without a map the map checks are skipped', () => {
    const cfg = proposal();
    const next = {
      ...cfg,
      agents: cfg.agents.map((a) => (a.agentType === 'dev-web' ? { ...a, desk: 'ENG-99' } : a)),
    };
    expect(checkConsistency({ quadro, escritorio: next, map: null })).toEqual([]);
  });
});

// ---- TeamRegistry with injected fs/watcher/clock -----------------------------------------

function makeRegistry(files: Map<string, string>, extra: { map?: unknown } = {}) {
  let watchCb: (() => void) | null = null;
  const watcher: TeamWatcher = {
    watch: (_paths, cb) => {
      watchCb = cb;
      return () => {
        watchCb = null;
      };
    },
  };
  let now = 1000;
  const reads: string[] = [];
  const registry = new TeamRegistry({
    escritorioPath: 'E',
    quadroPath: 'Q',
    readText: async (p) => {
      reads.push(p);
      return files.get(p) ?? null;
    },
    ...(extra.map !== undefined ? { readMapJson: async () => extra.map } : {}),
    watcher,
    now: () => now,
    sleep: async () => undefined,
  });
  return { registry, reads, fire: () => watchCb?.(), tick: (ms: number) => (now += ms) };
}

describe('TeamRegistry (CA-12, CA-13, CA-17, CA-21)', () => {
  it('CA-12: a valid file gives the exact 16 NPCs and no diagnostics', async () => {
    const { registry } = makeRegistry(
      new Map([
        ['E', proposalText],
        ['Q', quadroText],
      ]),
    );
    const change = await registry.load();
    expect(change.snapshot.source).toBe('escritorio');
    expect(change.snapshot.view.agents).toHaveLength(16);
    expect(change.snapshot.diagnostics).toEqual([]);
    expect(change.diff?.initial).toBe(true);
  });

  it('CA-13: missing file falls back to the QUADRO.md team (16) with a file diagnostic', async () => {
    const { registry } = makeRegistry(new Map([['Q', quadroText]]));
    const { snapshot } = await registry.load();
    expect(snapshot.source).toBe('quadro-fallback');
    expect(snapshot.view.agents).toHaveLength(16);
    expect(snapshot.diagnostics[0]).toMatchObject({
      code: 'team.file-missing',
      file: 'escritorio.json',
    });
    expect(registry.resolve({ agentType: 'dev-web' }).kind).toBe('fixed');
    expect(registry.resolve({ agentType: 'xyz', agentId: '1' }).kind).toBe('freelancer');
  });

  it('CA-13: neither file exists gives a minimal chefe-only team and still does not throw', async () => {
    const { registry } = makeRegistry(new Map());
    const { snapshot } = await registry.load();
    expect(snapshot.view.agents.map((a) => a.agentType)).toEqual(['chefe']);
  });

  it('CA-13: invalid edit keeps the last valid team and reports the failing field', async () => {
    const files = new Map([
      ['E', proposalText],
      ['Q', quadroText],
    ]);
    const { registry, fire } = makeRegistry(files);
    await registry.start();
    files.set(
      'E',
      mutated((raw) => delete raw.agents[5].fullName),
    );
    const seen: boolean[] = [];
    registry.onChange((c) => seen.push(c.changed));
    fire();
    const change = await registry.load();
    expect(change.snapshot.source).toBe('last-valid');
    expect(change.snapshot.view.agents).toHaveLength(16);
    expect(change.snapshot.diagnostics.map((d) => d.path)).toContain('agents.5.fullName');
    expect(change.diff).toBeNull();
    // the public diagnostic carries the stable code (and bounded params) for i18n
    expect(registry.publicDiagnostics.every((d) => typeof d.code === 'string')).toBe(true);
    expect(
      registry.publicDiagnostics.find((d) => d.path === 'agents.5.fullName')?.params?.field,
    ).toBe('agents.5.fullName');
  });

  it('CA-13: a missing escritorio.json is public as code team.file-missing, without file content', async () => {
    const registry = new TeamRegistry({
      escritorioPath: 'E',
      quadroPath: 'Q',
      readText: async () => null,
      sleep: async () => undefined,
    });
    await registry.load();
    const d = registry.publicDiagnostics.find((x) => x.code === 'team.file-missing');
    expect(d).toMatchObject({ file: 'escritorio.json', severity: 'error' });
    expect(DiagnosticSchema.safeParse(d).success).toBe(true);
  });

  it('CA-13: a half-written file is re-read once and accepted when it becomes valid', async () => {
    const files = new Map([
      ['E', '{ "schema": "escritorio/v1", '],
      ['Q', quadroText],
    ]);
    let reads = 0;
    const registry = new TeamRegistry({
      escritorioPath: 'E',
      quadroPath: 'Q',
      readText: async (p) => {
        if (p === 'E' && ++reads === 2) return proposalText; // the writer finished
        return files.get(p) ?? null;
      },
      sleep: async () => undefined,
    });
    const { snapshot } = await registry.load();
    expect(snapshot.source).toBe('escritorio');
  });

  it('CA-21: editing the file emits team.diff with the hire, once, via onChange', async () => {
    const files = new Map([
      ['E', proposalText],
      ['Q', quadroText],
    ]);
    const { registry, fire } = makeRegistry(files);
    await registry.start();
    const events: string[] = [];
    registry.onChange((c) => c.diff && events.push(...c.diff.added.map((a) => a.agentType)));
    const next = JSON.parse(proposalText);
    next.agents.push({
      ...next.agents[1],
      agentType: 'novato',
      nickname: 'Nova',
      desk: null,
      provisional: true,
    });
    files.set('E', JSON.stringify(next));
    fire();
    await registry.load();
    await registry.load(); // same content: no second event
    expect(events).toEqual(['novato']);
    expect(registry.snapshot?.diagnostics.map((d) => d.code)).toEqual(['team.npc-without-agent']);
  });

  it('CA-12: cross-file warnings from the map do not invalidate the file', async () => {
    const map = JSON.parse(read('team', 'mapa-index.json'));
    map.desks = map.desks.filter((d: { id: string }) => d.id !== 'ENG-02');
    const { registry } = makeRegistry(
      new Map([
        ['E', proposalText],
        ['Q', quadroText],
      ]),
      { map },
    );
    const { snapshot } = await registry.load();
    expect(snapshot.source).toBe('escritorio');
    expect(snapshot.diagnostics).toMatchObject([
      { code: 'team.desk-missing-in-map', severity: 'warning', path: 'agents.5.desk' },
    ]);
  });

  it('CA-17: stop() closes the watcher and concurrent loads coalesce', async () => {
    const files = new Map([
      ['E', proposalText],
      ['Q', quadroText],
    ]);
    const { registry, reads, fire } = makeRegistry(files);
    await registry.start();
    const before = reads.length;
    await Promise.all([registry.load(), registry.load(), registry.load()]);
    expect(reads.length - before).toBeLessThanOrEqual(4); // at most two passes (2 files each)
    registry.stop();
    expect(fire()).toBeUndefined();
  });
});

describe('TeamView contract', () => {
  it('the view built from a valid file satisfies TeamViewSchema', () => {
    const view: TeamView = configToView(proposal());
    expect(TeamViewSchema.safeParse(view).success).toBe(true);
  });
});
