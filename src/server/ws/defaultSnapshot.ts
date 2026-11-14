import { PROTOCOL_VERSION, type OfficeSnapshot, type PublicConfig } from '../../shared/contracts';

/**
 * Snapshot used until the office state (NPCs, approvals, projects, usage...) is plugged in by
 * the ingest/office modules: valid, empty, and carrying the real public config.
 */
export function emptySnapshot(config: PublicConfig, now: number): OfficeSnapshot {
  return {
    v: PROTOCOL_VERSION,
    now,
    team: {
      source: 'quadro-fallback',
      studio: { name: 'Escritório' },
      departments: [],
      agents: [],
    },
    npcs: [],
    approvals: [],
    projects: [],
    overflowProjects: [],
    usage: null,
    activity: [],
    config,
    diagnostics: [],
  };
}
