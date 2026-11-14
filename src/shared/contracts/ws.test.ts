import { describe, expect, it } from 'vitest';
import {
  ClientMessageSchema,
  ServerEnvelopeSchema,
  ServerMessageSchema,
  TerminalClientMessageSchema,
} from './ws';
import type { OfficeSnapshot } from './state';
import { OfficeSnapshotSchema } from './state';

const snapshot: OfficeSnapshot = {
  v: 1,
  now: 1_794_530_000_000,
  team: {
    source: 'quadro-fallback',
    studio: { name: 'Estudio' },
    departments: [{ id: 'diretoria', name: 'Diretoria' }],
    agents: [{ agentType: 'chefe', nickname: 'Chefe' }],
  },
  npcs: [
    {
      key: 'dev-web',
      kind: 'fixed',
      agentType: 'dev-web',
      displayName: 'Livia',
      status: 'working',
      activeCount: 2,
      since: 1_794_529_000_000,
      project: { kind: 'dev', name: 'Sites' },
      tool: 'edit',
      approvalIds: [],
    },
  ],
  approvals: [],
  projects: [
    {
      name: 'Sites',
      active: true,
      roomSlot: 0,
      plan: {
        size: 'M',
        phase: 'construcao',
        progress: 40,
        counts: { todo: 3, doing: 1, review: 0, done: 2, blocked: 0 },
        diagnostics: [],
      },
    },
  ],
  overflowProjects: [],
  usage: null,
  activity: [],
  config: {
    lang: 'pt-BR',
    sound: false,
    music: false,
    quality: 'auto',
    approvalDeadlineSec: 60,
    chatMode: {},
    npcWorkPlace: 'desk',
  },
  diagnostics: [],
};

describe('WebSocket contract', () => {
  it('CA-12: a full snapshot validates', () => {
    expect(OfficeSnapshotSchema.safeParse(snapshot).success).toBe(true);
  });

  it('CA-16: accepts npc.update with parallel instances (activeCount 2)', () => {
    const msg = { t: 'npc.update', npc: snapshot.npcs[0] };
    expect(ServerMessageSchema.safeParse(msg).success).toBe(true);
  });

  it('CA-12: accepts a batch envelope mixing message types', () => {
    const batch = {
      t: 'batch',
      items: [
        { t: 'hello', v: 1, serverVersion: '0.1.0', now: 1 },
        { t: 'snapshot', snapshot },
        { t: 'approval.remove', id: 'abc' },
        { t: 'rooms', slots: ['Sites', null, null, null], overflow: [] },
        { t: 'usage', usage: null },
        { t: 'diag', diagnostics: [{ file: 'escritorio.json', path: 'agents.1', message: 'x' }] },
      ],
    };
    expect(ServerEnvelopeSchema.safeParse(batch).success).toBe(true);
  });

  it('CA-18: ignores unknown fields in server messages (tolerant reader)', () => {
    const parsed = ServerMessageSchema.safeParse({ t: 'approval.remove', id: 'a', future: 1 });
    expect(parsed.success).toBe(true);
  });

  it('CA-18: rejects an unknown message type', () => {
    expect(ServerMessageSchema.safeParse({ t: 'nuke' }).success).toBe(false);
  });

  it('CA-16: rejects an invalid npc status', () => {
    const npc = { ...snapshot.npcs[0], status: 'sleeping' };
    expect(ServerMessageSchema.safeParse({ t: 'npc.update', npc }).success).toBe(false);
  });

  it('CA-30: the browser may only send ping on /ws', () => {
    expect(ClientMessageSchema.safeParse({ t: 'ping' }).success).toBe(true);
    expect(ClientMessageSchema.safeParse({ t: 'ping', extra: 1 }).success).toBe(false);
    expect(ClientMessageSchema.safeParse({ t: 'exec', cmd: 'calc' }).success).toBe(false);
  });

  it('CA-33: terminal input is bounded to 4 kB and resize to sane sizes', () => {
    expect(TerminalClientMessageSchema.safeParse({ t: 'input', data: 'ls\r' }).success).toBe(true);
    expect(
      TerminalClientMessageSchema.safeParse({ t: 'input', data: 'x'.repeat(4097) }).success,
    ).toBe(false);
    expect(
      TerminalClientMessageSchema.safeParse({ t: 'resize', cols: 120, rows: 30 }).success,
    ).toBe(true);
    expect(TerminalClientMessageSchema.safeParse({ t: 'resize', cols: 0, rows: 30 }).success).toBe(
      false,
    );
    expect(
      TerminalClientMessageSchema.safeParse({ t: 'input', data: 'a', cwd: 'C:\\' }).success,
    ).toBe(false);
  });
});
