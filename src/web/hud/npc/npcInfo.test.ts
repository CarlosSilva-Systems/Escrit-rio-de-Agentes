import { describe, expect, it } from 'vitest';
import type { NpcLogical } from '../../../shared/contracts';
import { makeSnapshot } from '../../store/fixtures';
import { formatElapsed, isSleepy, npcInfo, statusText } from './npcInfo';

const npc = (over: Partial<NpcLogical> = {}): NpcLogical => ({
  key: 'dev-web',
  kind: 'fixed',
  agentType: 'dev-web',
  displayName: 'dev-web',
  status: 'idle',
  activeCount: 0,
  since: 0,
  approvalIds: [],
  ...over,
});
const label = (p: { kind: 'dev' | 'outside'; name: string }) =>
  p.kind === 'dev' ? p.name : `Fora: ${p.name}`;

describe('NPC info for the cards', () => {
  const snapshot = makeSnapshot({
    team: {
      source: 'escritorio',
      studio: { name: 'E' },
      departments: [{ id: 'engenharia', name: 'Engenharia' }],
      agents: [
        {
          agentType: 'dev-web',
          nickname: 'Lívia',
          fullName: 'Lívia Duarte',
          title: 'Dev front-end',
          department: 'engenharia',
        },
        { agentType: 'dev-backend', nickname: 'Bruno' },
      ],
      freelancer: {
        nickname: 'Freelancer',
        title: 'Colaborador visitante',
        sprite: 'npc-freelancer',
        badge: 'visitante',
        showAgentTypeAsLabel: true,
        phrases: [],
        homeRoom: 'REC',
      },
    },
    npcs: [
      npc(),
      npc({
        key: 'freelancer:a1',
        kind: 'freelancer',
        agentType: 'general-purpose',
        displayName: 'Freelancer',
      }),
    ],
  });

  it('CA-14: shows the names that come from the team (full name, title, department)', () => {
    expect(npcInfo(snapshot, 'dev-web')).toMatchObject({
      name: 'Lívia',
      fullName: 'Lívia Duarte',
      title: 'Dev front-end',
      departmentName: 'Engenharia',
      kind: 'fixed',
    });
  });

  it('CA-13: works with the reserve team (nickname only, no full name or title)', () => {
    expect(npcInfo(snapshot, 'dev-backend')).toMatchObject({
      name: 'Bruno',
      fullName: null,
      title: null,
      logical: null,
    });
  });

  it('CA-17: a Freelancer shows the visitor title and its real agent_type', () => {
    expect(npcInfo(snapshot, 'freelancer:a1')).toMatchObject({
      kind: 'freelancer',
      title: 'Colaborador visitante',
      agentType: 'general-purpose',
      departmentName: null,
    });
  });

  it('CA-14: unknown keys and a missing snapshot give null', () => {
    expect(npcInfo(snapshot, 'nobody')).toBeNull();
    expect(npcInfo(null, 'dev-web')).toBeNull();
  });
});

describe('status line', () => {
  it('CA-14: idle / working on a task in a project / waiting for approval', () => {
    expect(statusText(npc(), label)).toMatchObject({ key: 'team.status.idle', icon: 'idle' });
    expect(statusText(npc({ status: 'awaiting' }), label)).toMatchObject({
      key: 'team.status.awaiting',
      icon: 'alert',
    });
    const working = npc({
      status: 'working',
      taskTitle: 'Testes de login',
      project: { kind: 'dev', name: 'Sites' },
    });
    expect(statusText(working, label)).toEqual({
      key: 'team.status.working',
      params: { tarefa: 'Testes de login', pasta: 'Sites' },
      icon: 'gear',
    });
  });

  it('CA-44: a project outside 7 - DEV is labelled as such; no project/task degrades gracefully', () => {
    expect(
      statusText(
        npc({ status: 'working', project: { kind: 'outside', basename: 'meu-app' } }),
        label,
      ),
    ).toMatchObject({
      key: 'team.status.working.project',
      params: { pasta: 'Fora: meu-app' },
    });
    expect(statusText(npc({ status: 'working' }), label).key).toBe('team.status.working.plain');
    expect(statusText(npc({ status: 'working', project: { kind: 'unknown' } }), label).key).toBe(
      'team.status.working.plain',
    );
  });

  it('CA-74: idle for 30 min shows the dozing text', () => {
    expect(isSleepy(npc({ since: 0 }), 29 * 60_000)).toBe(false);
    expect(isSleepy(npc({ since: 0 }), 31 * 60_000)).toBe(true);
    expect(isSleepy(npc({ status: 'working', since: 0 }), 99 * 60_000)).toBe(false);
    expect(statusText(npc(), label, true)).toMatchObject({
      key: 'team.status.sleepy',
      icon: 'zzz',
    });
  });

  it('CA-14: elapsed time is humanised and never negative', () => {
    expect(formatElapsed(-5)).toEqual({ key: 'time.sec', params: { n: 0 } });
    expect(formatElapsed(42_900)).toEqual({ key: 'time.sec', params: { n: 42 } });
    expect(formatElapsed(5 * 60_000 + 1)).toEqual({ key: 'time.min', params: { n: 5 } });
    expect(formatElapsed(125 * 60_000)).toEqual({ key: 'time.hm', params: { h: 2, m: 5 } });
  });
});
