// Test fixtures for the store and the net layer (validated by the real contract).

import { OfficeSnapshotSchema, type OfficeSnapshot } from '../../shared/contracts';

export function makeSnapshot(overrides: Partial<OfficeSnapshot> = {}): OfficeSnapshot {
  return OfficeSnapshotSchema.parse({
    v: 1,
    now: 1_700_000_000_000,
    team: {
      source: 'escritorio',
      studio: { name: 'Estúdio do Carlos' },
      departments: [],
      agents: [],
    },
    npcs: [],
    approvals: [],
    projects: [],
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
    ...overrides,
  });
}
