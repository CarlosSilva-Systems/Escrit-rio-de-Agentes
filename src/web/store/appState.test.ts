import { describe, expect, it } from 'vitest';
import type { NpcLogical } from '../../shared/contracts';
import {
  activeProjects,
  agentsWorking,
  applyServerMessage,
  initialState,
  studioName,
  teamSize,
} from './appState';
import { makeSnapshot } from './fixtures';
import { createStore } from './store';

const npc = (
  key: string,
  status: NpcLogical['status'],
  kind: NpcLogical['kind'] = 'fixed',
): NpcLogical => ({
  key,
  kind,
  agentType: key,
  displayName: key,
  status,
  activeCount: status === 'idle' ? 0 : 1,
  since: 1,
  approvalIds: [],
});

describe('store', () => {
  it('CA-80: notifies subscribers only when something actually changed', () => {
    const store = createStore({ a: 1, b: 2 });
    let calls = 0;
    const off = store.subscribe(() => void calls++);
    store.setState({ a: 1 });
    expect(calls).toBe(0);
    store.setState({ a: 2 });
    expect(calls).toBe(1);
    store.setState((s) => ({ b: s.b + 1 }));
    expect(store.getState()).toEqual({ a: 2, b: 3 });
    off();
    store.setState({ a: 9 });
    expect(calls).toBe(2);
  });
});

describe('server message reducer', () => {
  it('CA-77: sound starts muted and follows the snapshot config', () => {
    expect(initialState().soundOn).toBe(false);
    const s = applyServerMessage(initialState(), {
      t: 'snapshot',
      snapshot: makeSnapshot({ config: { ...makeSnapshot().config, sound: true } }),
    });
    expect(s.soundOn).toBe(true);
  });

  it('CA-15: npc.update upserts by key and the HUD counters follow it', () => {
    let s = applyServerMessage(initialState(), {
      t: 'snapshot',
      snapshot: makeSnapshot({ npcs: [npc('dev-web', 'idle'), npc('dev-backend', 'idle')] }),
    });
    expect(agentsWorking(s.snapshot)).toBe(0);
    s = applyServerMessage(s, { t: 'npc.update', npc: npc('dev-web', 'working') });
    s = applyServerMessage(s, { t: 'npc.update', npc: npc('testador-qa', 'awaiting') });
    expect(s.snapshot?.npcs).toHaveLength(3);
    expect(agentsWorking(s.snapshot)).toBe(2);
  });

  it('CA-17: freelancers do not count in "agents X/16"', () => {
    const s = applyServerMessage(initialState(), {
      t: 'snapshot',
      snapshot: makeSnapshot({ npcs: [npc('freelancer:abc', 'working', 'freelancer')] }),
    });
    expect(agentsWorking(s.snapshot)).toBe(0);
  });

  it('CA-80: the team size comes from the config and falls back to 16', () => {
    expect(teamSize(null)).toBe(16);
    expect(teamSize(makeSnapshot())).toBe(16);
  });

  it('CA-80: active projects are counted from the project list', () => {
    const s = applyServerMessage(initialState(), {
      t: 'snapshot',
      snapshot: makeSnapshot({
        projects: [
          { name: 'Sites', active: true },
          { name: 'Odoo', active: false },
        ],
      }),
    });
    expect(activeProjects(s.snapshot)).toBe(1);
    const s2 = applyServerMessage(s, {
      t: 'project.upsert',
      project: { name: 'Odoo', active: true },
    });
    expect(activeProjects(s2.snapshot)).toBe(2);
  });

  it('CA-80: activity keeps the newest 200 first and ignores duplicates', () => {
    let s = applyServerMessage(initialState(), { t: 'snapshot', snapshot: makeSnapshot() });
    for (let i = 0; i < 250; i++) {
      s = applyServerMessage(s, {
        t: 'activity',
        item: { id: `a${i}`, ts: i, npcKey: 'x', kind: 'turn.stop', project: { kind: 'unknown' } },
      });
    }
    expect(s.snapshot?.activity).toHaveLength(200);
    expect(s.snapshot?.activity[0]?.id).toBe('a249');
    const again = applyServerMessage(s, {
      t: 'activity',
      item: { id: 'a249', ts: 1, npcKey: 'x', kind: 'turn.stop', project: { kind: 'unknown' } },
    });
    expect(again).toBe(s);
  });

  it('CA-80: a snapshot arrives oldest-first and is stored newest-first', () => {
    const item = (id: string, ts: number) => ({
      id,
      ts,
      npcKey: 'x',
      kind: 'turn.stop' as const,
      project: { kind: 'unknown' as const },
    });
    const s = applyServerMessage(initialState(), {
      t: 'snapshot',
      snapshot: makeSnapshot({ activity: [item('a', 1), item('b', 2), item('c', 3)] }),
    });
    expect(s.snapshot?.activity.map((a) => a.id)).toEqual(['c', 'b', 'a']);
  });

  it('CA-37: approvals are added, replaced and removed', () => {
    const card = {
      id: 'ap1',
      createdAt: 1,
      deadline: 2,
      state: 'pending' as const,
      sessionId: 's',
      npcKey: 'dev-web',
      project: { kind: 'unknown' as const },
      toolName: 'Bash',
      summary: 'npm install',
      kind: 'tool' as const,
    };
    let s = applyServerMessage(initialState(), { t: 'snapshot', snapshot: makeSnapshot() });
    s = applyServerMessage(s, { t: 'approval.upsert', approval: card });
    s = applyServerMessage(s, { t: 'approval.upsert', approval: { ...card, state: 'allowed' } });
    expect(s.snapshot?.approvals).toHaveLength(1);
    expect(s.snapshot?.approvals[0]?.state).toBe('allowed');
    s = applyServerMessage(s, { t: 'approval.remove', id: 'ap1' });
    expect(s.snapshot?.approvals).toHaveLength(0);
  });

  it('CA-17: npc.remove drops a Freelancer that left (and is harmless for unknown keys)', () => {
    let s = applyServerMessage(initialState(), {
      t: 'snapshot',
      snapshot: makeSnapshot({
        npcs: [npc('dev-web', 'idle'), npc('freelancer:a', 'idle', 'freelancer')],
      }),
    });
    const before = s;
    s = applyServerMessage(s, { t: 'npc.remove', key: 'ghost' });
    expect(s).toBe(before);
    s = applyServerMessage(s, { t: 'npc.remove', key: 'freelancer:a' });
    expect(s.snapshot?.npcs.map((n) => n.key)).toEqual(['dev-web']);
  });

  it('CA-12: updates that arrive before the first snapshot are ignored', () => {
    const s = initialState();
    expect(applyServerMessage(s, { t: 'npc.update', npc: npc('dev-web', 'working') })).toBe(s);
  });

  it('CA-43: rooms messages keep the 4 project slots', () => {
    const s = applyServerMessage(initialState(), {
      t: 'rooms',
      slots: ['Sites', null, 'Odoo', null],
      overflow: [],
    });
    expect(s.roomSlots).toEqual(['Sites', null, 'Odoo', null]);
  });

  it('CA-20: the studio name comes from the team config; blank means use the placeholder', () => {
    expect(studioName(makeSnapshot())).toBe('Estúdio do Carlos');
    expect(
      studioName(makeSnapshot({ team: { ...makeSnapshot().team, studio: { name: '  ' } } })),
    ).toBeNull();
    expect(studioName(null)).toBeNull();
  });
});
