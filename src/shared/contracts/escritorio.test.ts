import { describe, expect, it } from 'vitest';
import proposta from '../../../tests/fixtures/escritorio/proposta.valid.json';
import { EscritorioSchema } from './escritorio';

type Json = Record<string, unknown>;
const clone = (): Json => structuredClone(proposta) as unknown as Json;
const agents = (cfg: Json) => cfg.agents as Json[];

function issuesOf(cfg: unknown): string[] {
  const parsed = EscritorioSchema.safeParse(cfg);
  return parsed.success ? [] : parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
}

describe('escritorio/v1 contract', () => {
  it('CA-12: the team proposal (escritorio.proposta.json) is valid', () => {
    expect(issuesOf(proposta)).toEqual([]);
  });

  it('CA-12: has 16 agents and exactly one lead', () => {
    const parsed = EscritorioSchema.parse(proposta);
    expect(parsed.agents).toHaveLength(16);
    expect(parsed.agents.filter((a) => a.isLead)).toHaveLength(1);
  });

  it('CA-13: a missing required field is reported with its path', () => {
    const cfg = clone();
    delete (agents(cfg)[1] as Json).nickname;
    expect(issuesOf(cfg).join('\n')).toContain('agents.1.nickname');
  });

  it('CA-13: a missing top-level block is reported', () => {
    const cfg = clone();
    delete cfg.freelancer;
    expect(issuesOf(cfg).join('\n')).toContain('freelancer');
  });

  it('CA-13: an unknown field is rejected (strict config)', () => {
    const cfg = clone();
    cfg.extra = true;
    expect(issuesOf(cfg)).not.toEqual([]);
  });

  it('CA-13: rejects another schema version', () => {
    const cfg = clone();
    cfg.schema = 'escritorio/v2';
    expect(issuesOf(cfg)).not.toEqual([]);
  });

  it('CA-12: rejects a duplicated agentType', () => {
    const cfg = clone();
    (agents(cfg)[1] as Json).agentType = (agents(cfg)[0] as Json).agentType;
    expect(issuesOf(cfg).join('\n')).toContain('duplicate agentType');
  });

  it('CA-12: rejects an agent in an unknown department', () => {
    const cfg = clone();
    (agents(cfg)[1] as Json).department = 'nowhere';
    expect(issuesOf(cfg).join('\n')).toContain('unknown department');
  });

  it('CA-12: rejects one desk assigned to two agents', () => {
    const cfg = clone();
    (agents(cfg)[1] as Json).desk = (agents(cfg)[2] as Json).desk;
    expect(issuesOf(cfg).join('\n')).toContain('assigned to more than one agent');
  });

  it('CA-12: rejects zero or two leads', () => {
    const none = clone();
    for (const a of agents(none)) a.isLead = false;
    expect(issuesOf(none).join('\n')).toContain('isLead');
    const two = clone();
    for (const a of agents(two).slice(0, 2)) a.isLead = true;
    expect(issuesOf(two).join('\n')).toContain('isLead');
  });

  it('CA-21: a hire without a free desk uses desk null + provisional', () => {
    const cfg = clone();
    const agent = agents(cfg)[1] as Json;
    agent.desk = null;
    agent.provisional = true;
    expect(issuesOf(cfg)).toEqual([]);
  });

  it('CA-17: the freelancer template needs the visitor badge and a home room', () => {
    const cfg = clone();
    (cfg.freelancer as Json).badge = 'staff';
    expect(issuesOf(cfg).join('\n')).toContain('freelancer.badge');
    const cfg2 = clone();
    delete (cfg2.freelancer as Json).homeRoom;
    expect(issuesOf(cfg2).join('\n')).toContain('freelancer.homeRoom');
  });

  it.each([
    ['agentType with capitals', { agentType: 'Dev-Web' }],
    ['desk in lowercase', { desk: 'pln-01' }],
    ['nickname above 24 chars', { nickname: 'x'.repeat(25) }],
    ['more than 50 phrases', { phrases: Array.from({ length: 51 }, () => 'oi') }],
    [
      'routine weight above 5',
      { personality: { traits: ['a'], tone: 't', routineWeights: { coffee: 9 } } },
    ],
    [
      'unknown routine activity',
      { personality: { traits: ['a'], tone: 't', routineWeights: { skydiving: 1 } } },
    ],
  ])('CA-13: rejects %s', (_label, patch) => {
    const cfg = clone();
    Object.assign(agents(cfg)[1] as Json, patch);
    expect(issuesOf(cfg)).not.toEqual([]);
  });

  it('CA-12: defaults are applied (badge staff, provisional false)', () => {
    const parsed = EscritorioSchema.parse(proposta);
    const alice = parsed.agents.find((a) => a.agentType === 'analista');
    expect(alice?.badge).toBe('staff');
    expect(alice?.provisional).toBe(false);
  });
});
