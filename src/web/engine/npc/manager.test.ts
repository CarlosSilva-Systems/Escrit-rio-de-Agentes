import { describe, expect, it } from 'vitest';
import type { NpcLogical, TeamView } from '../../../shared/contracts';
import { buildProvisionalMap } from '../../../shared/world/provisionalMap';
import type { Atlas, Frame } from '../atlas';
import { createWorld } from '../world/world';
import { NpcManager, type TeamChange } from './manager';

const frame: Frame = {
  source: {} as CanvasImageSource,
  sx: 0,
  sy: 0,
  sw: 16,
  sh: 32,
  ax: 0,
  ay: 16,
};
const atlas: Atlas = {
  providesTiles: false,
  frame: (n) => (n.startsWith('npc-') || n.startsWith('icon/') ? frame : undefined),
  tile: () => undefined,
};
const world = createWorld(buildProvisionalMap(), atlas, true);

const TYPES: [string, string, string][] = [
  ['chefe', 'Chefe', 'diretoria'],
  ['analista', 'Alice', 'planejamento'],
  ['arquiteto', 'Artur', 'planejamento'],
  ['designer-ux', 'Bianca', 'planejamento'],
  ['dev-web', 'Lívia', 'engenharia'],
  ['dev-backend', 'Bruno', 'engenharia'],
  ['dev-odoo', 'Otávio', 'engenharia'],
  ['dev-embarcados', 'Eduardo', 'engenharia'],
  ['dev-automacao', 'Rafael', 'engenharia'],
  ['testador-qa', 'Teresa', 'qualidade'],
  ['revisor-codigo', 'Rita', 'qualidade'],
  ['revisor-seguranca', 'Sérgio', 'qualidade'],
  ['pentester', 'Pedro', 'qualidade'],
  ['git-github', 'Gabriela', 'entrega'],
  ['documentador', 'Davi', 'entrega'],
  ['pesquisador', 'Paula', 'biblioteca'],
];

// The QUADRO.md reserve team: no desks, no sprite names.
const team = (extra: [string, string, string][] = [], drop: string[] = []): TeamView => ({
  source: 'quadro-fallback',
  studio: { name: 'Escritório' },
  departments: [],
  agents: [...TYPES, ...extra]
    .filter(([t]) => !drop.includes(t))
    .map(([agentType, nickname, department]) => ({
      agentType,
      nickname,
      department,
      desk: null,
      isLead: agentType === 'chefe',
    })),
});

const npc = (
  key: string,
  status: NpcLogical['status'],
  extra: Partial<NpcLogical> = {},
): NpcLogical => ({
  key,
  kind: 'fixed',
  agentType: key,
  displayName: key,
  status,
  activeCount: status === 'idle' ? 0 : 1,
  since: 1,
  approvalIds: [],
  ...extra,
});

function setup(reduced = false) {
  const changes: TeamChange[] = [];
  const m = new NpcManager(world, atlas, {
    reducedMotion: () => reduced,
    onTeamChange: (c) => changes.push(c),
  });
  return { m, changes };
}
const run = (m: NpcManager, ms: number) => {
  for (let t = 0; t < ms; t += 33) m.update(33);
};
const row = (m: NpcManager, key: string) => m.debug().find((r) => r.key === key);

describe('NPC manager', () => {
  it('CA-15: all 16 appear at their desks from the team alone, even with the reserve team (no desks)', () => {
    const { m } = setup();
    m.syncTeam(team());
    const sprites = m.sprites().filter((s) => !s.id.endsWith('#icon'));
    expect(sprites).toHaveLength(16);
    // Each at a distinct seat tile.
    const tiles = new Set(m.debug().map((r) => `${r.tile[0]},${r.tile[1]}`));
    expect(tiles.size).toBe(16);
    expect(row(m, 'dev-web')?.tile).toEqual([3, 17]); // ENG-01
    expect(row(m, 'chefe')?.tile).toEqual([9, 4]); // DIR-00
    expect(m.debug().every((r) => r.mode === 'atDesk' && r.anim === 'sit')).toBe(true);
  });

  it('CA-15: a working status makes the right NPC type at its desk with the gear icon, others keep sitting', () => {
    const { m } = setup();
    m.syncTeam(team());
    m.syncNpcs([
      npc('dev-web', 'working', { tool: 'edit' }),
      npc('pesquisador', 'working', { tool: 'web' }),
    ]);
    expect(row(m, 'dev-web')).toMatchObject({ mode: 'working', anim: 'type' });
    expect(row(m, 'pesquisador')).toMatchObject({ mode: 'working', anim: 'read' });
    expect(row(m, 'dev-backend')?.mode).toBe('atDesk');
    expect(
      m.sprites().filter((s) => s.id.endsWith('#icon') && s.frameName === 'icon/gear'),
    ).toHaveLength(2);
  });

  it('CA-16: Stop celebrates briefly and returns to normal', () => {
    const { m } = setup();
    m.syncTeam(team());
    m.syncNpcs([npc('dev-web', 'working', { since: 1 })]);
    m.syncNpcs([npc('dev-web', 'idle', { since: 2 })]);
    expect(row(m, 'dev-web')?.mode).toBe('celebrating');
    expect(m.moving()).toBe(true);
    run(m, 2000);
    expect(row(m, 'dev-web')?.mode).toBe('atDesk');
    expect(m.moving()).toBe(false);
  });

  it('CA-71: awaiting approval sends the NPC to the Director door queue and back', () => {
    const { m } = setup();
    m.syncTeam(team());
    m.syncNpcs([npc('testador-qa', 'awaiting', { since: 1 })]);
    expect(row(m, 'testador-qa')?.mode).toBe('goingToQueue');
    run(m, 120_000);
    expect(row(m, 'testador-qa')).toMatchObject({ mode: 'awaiting', tile: [9, 12] });
    const icon = m.sprites().find((s) => s.id === 'testador-qa#icon');
    expect(icon?.frameName).toBe('icon/alert');
    m.syncNpcs([npc('testador-qa', 'working', { since: 2, tool: 'bash' })]);
    run(m, 120_000);
    expect(row(m, 'testador-qa')?.mode).toBe('working');
  });

  it('CA-17: an unknown agent_type becomes a Freelancer who walks in, works, and walks out', () => {
    const { m } = setup();
    m.syncTeam(team());
    const key = 'freelancer:agent-9';
    m.syncNpcs([
      npc(key, 'working', { kind: 'freelancer', agentType: 'general-purpose', tool: 'read' }),
    ]);
    expect(m.has(key)).toBe(true);
    expect(row(m, key)?.mode).toBe('arriving');
    run(m, 120_000);
    expect(row(m, key)).toMatchObject({ mode: 'working', anim: 'read' });
    expect(m.spriteKeyOf(key)).toMatch(/^npc-freelancer/);
    // done: idle + activeCount 0 -> leaves, then is removed
    m.syncNpcs([npc(key, 'idle', { kind: 'freelancer', agentType: 'general-purpose', since: 5 })]);
    expect(row(m, key)?.mode).toBe('leaving');
    run(m, 120_000);
    expect(m.has(key)).toBe(false);
  });

  it('CA-17: a Freelancer that disappears from the snapshot also leaves', () => {
    const { m } = setup();
    m.syncTeam(team());
    const key = 'freelancer:z';
    m.syncNpcs([npc(key, 'working', { kind: 'freelancer', agentType: 'x' })]);
    run(m, 120_000);
    m.syncNpcs([]);
    expect(row(m, key)?.mode).toBe('leaving');
  });

  it('CA-15: status for an agent that is not on the team is ignored', () => {
    const { m } = setup();
    m.syncTeam(team());
    m.syncNpcs([npc('ghost', 'working')]);
    expect(m.has('ghost')).toBe(false);
  });

  it('CA-21: a new agent plays the welcome scene to a free desk of its department; the change is reported', () => {
    const { m, changes } = setup();
    m.syncTeam(team());
    m.syncTeam(team([['dev-novo', 'Nina', 'engenharia']]));
    expect(changes).toEqual([
      { added: [{ agentType: 'dev-novo', nickname: 'Nina', provisional: false }], removed: [] },
    ]);
    expect(row(m, 'dev-novo')?.mode).toBe('arriving');
    run(m, 120_000);
    expect(row(m, 'dev-novo')).toMatchObject({ mode: 'atDesk', tile: [3, 21] }); // ENG-V1
  });

  it('CA-21: a removed agent says goodbye: walks out, frees the desk, and the change is reported', () => {
    const { m, changes } = setup();
    m.syncTeam(team());
    m.syncTeam(team([], ['pentester']));
    expect(changes.at(-1)?.removed).toEqual([{ agentType: 'pentester', nickname: 'Pedro' }]);
    expect(row(m, 'pentester')?.mode).toBe('leaving');
    run(m, 120_000);
    expect(m.has('pentester')).toBe(false);
  });

  it('CA-21: the same team sent again (reconnect snapshot) changes nothing', () => {
    const { m, changes } = setup();
    const t = team();
    m.syncTeam(t);
    m.syncTeam({ ...t });
    expect(changes).toEqual([]);
    expect(m.debug()).toHaveLength(16);
  });

  it('CA-22: with reduced motion NPCs never walk: status changes snap them to the destination', () => {
    const { m } = setup(true);
    m.syncTeam(team());
    m.syncNpcs([npc('dev-web', 'awaiting', { since: 1 })]);
    expect(row(m, 'dev-web')).toMatchObject({ mode: 'awaiting', tile: [9, 12] });
    expect(m.moving()).toBe(false);
    m.syncNpcs([npc('dev-web', 'working', { since: 2, tool: 'edit' })]);
    expect(row(m, 'dev-web')).toMatchObject({ mode: 'working', tile: [3, 17] });
  });

  it('CA-65: repeating an unchanged snapshot does not restart anything', () => {
    const { m } = setup();
    m.syncTeam(team());
    const list = [npc('dev-web', 'working', { tool: 'edit' })];
    m.syncNpcs(list);
    run(m, 1000);
    const before = row(m, 'dev-web');
    m.syncNpcs([...list]);
    expect(row(m, 'dev-web')).toEqual(before);
  });

  it('CA-21: hire and leave in the same team change are both reported', () => {
    const { m, changes } = setup();
    m.syncTeam(team());
    m.syncTeam(team([['dev-novo', 'Nina', 'engenharia']], ['pentester']));
    expect(changes.at(-1)).toEqual({
      added: [{ agentType: 'dev-novo', nickname: 'Nina', provisional: false }],
      removed: [{ agentType: 'pentester', nickname: 'Pedro' }],
    });
  });

  it('CA-21: an agent that returns to the team while walking out turns around and sits again', () => {
    const { m, changes } = setup();
    m.syncTeam(team());
    m.syncTeam(team([], ['pentester']));
    run(m, 600);
    expect(row(m, 'pentester')?.mode).toBe('leaving');
    m.syncTeam(team());
    expect(changes.at(-1)?.added).toEqual([{ agentType: 'pentester', nickname: 'Pedro' }]);
    expect(row(m, 'pentester')?.mode).toBe('returning');
    run(m, 120_000);
    expect(row(m, 'pentester')?.mode).toBe('atDesk');
  });

  it('CA-21: removing an agent that is already leaving is not announced twice', () => {
    const { m, changes } = setup();
    m.syncTeam(team());
    m.syncTeam(team([], ['pentester']));
    const n = changes.length;
    m.syncTeam(team([], ['pentester', 'pesquisador']));
    expect(changes.slice(n)).toEqual([
      { added: [], removed: [{ agentType: 'pesquisador', nickname: 'Paula' }] },
    ]);
  });

  it('CA-17: an idle Freelancer with activeCount 0 and no actor is not recreated (no ghost)', () => {
    const { m } = setup();
    m.syncTeam(team());
    m.syncNpcs([npc('freelancer:old', 'idle', { kind: 'freelancer', agentType: 'x' })]);
    expect(m.has('freelancer:old')).toBe(false);
  });

  it('CA-65: sprites() reuses one array between frames', () => {
    const { m } = setup();
    m.syncTeam(team());
    expect(m.sprites()).toBe(m.sprites());
  });

  it('CA-21: a hire with no free desk in its department gets a provisional Reception desk and the change says so', () => {
    const { m, changes } = setup();
    m.syncTeam(team());
    // Diretoria has only DIR-00 (taken by the chefe): the next one falls to the Reception desks.
    m.syncTeam(team([['diretor-2', 'Dora', 'diretoria']]));
    expect(changes.at(-1)?.added).toEqual([
      { agentType: 'diretor-2', nickname: 'Dora', provisional: true },
    ]);
    run(m, 120_000);
    expect(row(m, 'diretor-2')?.tile).toEqual([2, 45]); // FL-D1
  });
});
