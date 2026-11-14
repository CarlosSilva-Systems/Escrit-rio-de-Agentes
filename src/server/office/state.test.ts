import { describe, expect, it } from 'vitest';
import { OfficeSnapshotSchema, type OfficeEvent, type TeamView } from '../../shared/contracts';
import { createEventFactory, type EventInit } from '../../shared/events';
import { buildFallbackView } from '../team/fallback';
import { resolveAgent } from '../team/resolve';
import { DEFAULT_PUBLIC_CONFIG } from '../config/store';
import { OfficeState, type StateChange, type TeamLookup } from './state';

function setup(initialView?: TeamView) {
  let view =
    initialView ??
    buildFallbackView([
      { agentType: 'chefe', nickname: 'Chefe', phase: 'Todas', role: 'lead' },
      { agentType: 'dev-web', nickname: 'Lívia', phase: 'Construir', role: 'web' },
      { agentType: 'dev-backend', nickname: 'Bruno', phase: 'Construir', role: 'api' },
    ]);
  const team: TeamLookup = {
    get view() {
      return view;
    },
    resolve: (i) => resolveAgent(view, i),
    publicDiagnostics: [],
  };
  let now = 1_000_000;
  const state = new OfficeState({ team, config: () => DEFAULT_PUBLIC_CONFIG, now: () => now });
  const make = createEventFactory({ now: () => now });
  const changes: StateChange[] = [];
  state.onChange((c) => changes.push(c));
  const send = (init: Omit<EventInit, 'source'>): OfficeEvent => {
    const e = make({ source: 'hook', sessionId: 's1', ...init });
    state.apply(e);
    return e;
  };
  return {
    state,
    send,
    changes,
    advance: (ms: number) => {
      now += ms;
    },
    setView: (v: TeamView) => {
      view = v;
      state.onTeamChange();
    },
  };
}

const start = (id: string, type = 'dev-web'): Omit<EventInit, 'source'> => ({
  kind: 'subagent.start',
  agentType: type,
  agentId: id,
});
const stop = (id: string, type = 'dev-web'): Omit<EventInit, 'source'> => ({
  kind: 'subagent.stop',
  agentType: type,
  agentId: id,
});

describe('OfficeState status (T-21)', () => {
  it('CA-16: 2 Starts + 1 Stop = working; the final Stop = idle', () => {
    const { state, send } = setup();
    send(start('a1'));
    send(start('a2'));
    send(stop('a1'));
    expect(state.npc('dev-web')).toMatchObject({ status: 'working', activeCount: 1 });
    send(stop('a2'));
    expect(state.npc('dev-web')).toMatchObject({ status: 'idle', activeCount: 0 });
  });

  it('CA-16: an orphan Stop never goes negative; a repeated Start is idempotent', () => {
    const { state, send } = setup();
    send(stop('ghost'));
    expect(state.npc('dev-web')?.activeCount).toBe(0);
    expect(state.counters.orphanStops).toBe(1);
    send(start('a1'));
    send(start('a1')); // reconnect / duplicate source
    expect(state.npc('dev-web')?.activeCount).toBe(1);
    send(stop('a1'));
    expect(state.npc('dev-web')?.status).toBe('idle');
  });

  it('CA-16: a late tool event does not resurrect a stopped subagent', () => {
    const { state, send } = setup();
    send(start('a1'));
    send(stop('a1'));
    send({
      kind: 'tool.pre',
      agentType: 'dev-web',
      agentId: 'a1',
      tool: { name: 'Edit', category: 'edit' },
    });
    expect(state.npc('dev-web')?.status).toBe('idle');
  });

  it('CA-15: the main thread is the lead: working between prompt.submit and turn.stop', () => {
    const { state, send } = setup();
    send({ kind: 'prompt.submit' });
    expect(state.npc('chefe')).toMatchObject({ status: 'working', activeCount: 1 });
    send({ kind: 'tool.pre', tool: { name: 'Read', category: 'read' } });
    expect(state.npc('chefe')?.tool).toBe('read');
    send({ kind: 'tool.post', tool: { name: 'Read', category: 'read' } });
    expect(state.npc('chefe')?.tool).toBeUndefined();
    send({ kind: 'turn.stop' });
    expect(state.npc('chefe')?.status).toBe('idle');
  });

  it('CA-17: an unknown agent_type becomes a freelancer removed 5 s after its Stop', () => {
    const { state, send, advance } = setup();
    send(start('zz9', 'mystery-agent'));
    const f = state.npc('freelancer:zz9');
    expect(f).toMatchObject({ kind: 'freelancer', agentType: 'mystery-agent', status: 'working' });
    send(stop('zz9', 'mystery-agent'));
    expect(state.npc('freelancer:zz9')).toMatchObject({ status: 'idle', activeCount: 0 });
    advance(4000);
    state.sweep();
    expect(state.hasNpc('freelancer:zz9')).toBe(true);
    advance(1500);
    state.sweep();
    expect(state.hasNpc('freelancer:zz9')).toBe(false);
  });

  it('CA-17: a freelancer is replaced live when its type joins the team', () => {
    const { state, send, setView } = setup();
    send(start('zz9', 'dev-data'));
    expect(state.hasNpc('freelancer:zz9')).toBe(true);
    setView(
      buildFallbackView([
        { agentType: 'chefe', nickname: 'Chefe', phase: 'Todas', role: '' },
        { agentType: 'dev-data', nickname: 'Dora', phase: 'Construir', role: '' },
      ]),
    );
    expect(state.npc('dev-data')).toMatchObject({
      kind: 'fixed',
      status: 'working',
      activeCount: 1,
    });
  });

  it('CA-37: awaiting (permission request / notification) wins over working and clears on progress', () => {
    const { state, send } = setup();
    send(start('a1'));
    send({
      kind: 'permission.request',
      agentType: 'dev-web',
      agentId: 'a1',
      tool: { name: 'Write', category: 'edit' },
    });
    expect(state.npc('dev-web')?.status).toBe('awaiting');
    send({
      kind: 'tool.post',
      agentType: 'dev-web',
      agentId: 'a1',
      tool: { name: 'Write', category: 'edit' },
    });
    expect(state.npc('dev-web')?.status).toBe('working');
    send({ kind: 'notification', notificationType: 'permission_prompt' });
    expect(state.npc('chefe')?.status).toBe('awaiting');
    send({ kind: 'notification', notificationType: 'idle_prompt' });
    expect(state.npc('chefe')?.status).toBe('awaiting'); // an unrelated notification keeps it
  });

  it('CA-16: stale instances and awaiting marks expire', () => {
    const { state, send, advance } = setup();
    send(start('a1'));
    send({ kind: 'notification', notificationType: 'permission_prompt' });
    advance(11 * 60_000);
    state.sweep();
    expect(state.npc('chefe')?.status).toBe('working'); // awaiting expired, the instance remains
    advance(5 * 60_000);
    state.sweep();
    expect(state.npc('dev-web')?.status).toBe('idle');
    expect(state.npc('chefe')?.status).toBe('idle');
    expect(state.counters.expiredInstances).toBeGreaterThan(0);
  });

  it('CA-15: session.end drops every instance of that session', () => {
    const { state, send } = setup();
    send(start('a1'));
    send({ kind: 'prompt.submit' });
    send({ kind: 'session.end' });
    expect(state.liveInstanceCount()).toBe(0);
  });
});

describe('OfficeState feed and snapshot (T-21)', () => {
  it('CA-19: history per NPC keeps metadata only, newest first, at least the last 10', () => {
    const { state, send } = setup();
    for (let i = 0; i < 12; i++) {
      send({
        kind: 'tool.pre',
        agentType: 'dev-web',
        agentId: 'a1',
        tool: { name: `T${i}`, category: 'other' },
      });
    }
    const h = state.historyOf('dev-web');
    expect(h.length).toBeGreaterThanOrEqual(10);
    expect(h[0]?.summary).toBe('T11');
    expect(JSON.stringify(h)).not.toMatch(/prompt|command/);
  });

  it('CA-19: the global activity ring holds 500 and the snapshot sends the last 200', () => {
    const { state, send } = setup();
    for (let i = 0; i < 600; i++) send({ kind: 'prompt.submit' });
    const snap = state.snapshot();
    expect(snap.activity).toHaveLength(200);
    expect(OfficeSnapshotSchema.safeParse(snap).success).toBe(true);
  });

  it('CA-15: only real changes are published (idempotent reconnect)', () => {
    const { send, changes } = setup();
    send(start('a1'));
    const before = changes.filter((c) => c.type === 'npc').length;
    send(start('a1'));
    expect(changes.filter((c) => c.type === 'npc').length).toBe(before);
  });

  it('CA-44: projects are tracked with active flag', () => {
    const { state, send } = setup();
    send({ ...start('a1'), project: { kind: 'dev', name: 'Sites' } });
    expect(state.snapshot().projects).toMatchObject([{ name: 'Sites', active: true }]);
    send({ ...stop('a1'), project: { kind: 'dev', name: 'Sites' } });
    expect(state.snapshot().projects[0]?.active).toBe(false);
  });

  it('CA-12: the snapshot lists every team agent as an NPC, idle', () => {
    const { state } = setup();
    expect(state.snapshot().npcs.map((n) => n.key)).toEqual(['chefe', 'dev-web', 'dev-backend']);
  });
});
