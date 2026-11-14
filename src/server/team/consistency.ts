import { z } from 'zod';
import type { Escritorio } from '../../shared/contracts';
import { diag } from './diagnostics';
import type { TeamDiagnostic } from './diagnostics';
import type { QuadroAgent } from './quadro';

// Cross-file consistency: QUADRO.md x escritorio.json x mapa.json (CA-12, CA-21, ADR-0008 §3).
// Pure functions. The map is read loosely (only ids and room/department links) so the check
// works with the real `assets/map/mapa.json` and with small fixtures.

export interface MapIndex {
  rooms: ReadonlyMap<string, { department?: string }>;
  /** Desk and seat ids (they share one id space in mapa/v1) -> room. */
  desks: ReadonlyMap<string, { room: string; department?: string }>;
}

const LooseMapSchema = z.object({
  rooms: z.array(z.object({ id: z.string(), department: z.string().optional() }).loose()),
  desks: z
    .array(
      z.object({ id: z.string(), room: z.string(), department: z.string().optional() }).loose(),
    )
    .default([]),
  seats: z.array(z.object({ id: z.string(), room: z.string() }).loose()).default([]),
});

export function parseMapIndex(raw: unknown): MapIndex | null {
  const parsed = LooseMapSchema.safeParse(raw);
  if (!parsed.success) return null;
  const rooms = new Map<string, { department?: string }>();
  for (const r of parsed.data.rooms)
    rooms.set(r.id, r.department ? { department: r.department } : {});
  const desks = new Map<string, { room: string; department?: string }>();
  for (const d of parsed.data.desks)
    desks.set(d.id, { room: d.room, ...(d.department ? { department: d.department } : {}) });
  for (const s of parsed.data.seats) if (!desks.has(s.id)) desks.set(s.id, { room: s.room });
  return { rooms, desks };
}

export interface ConsistencyInput {
  quadro?: readonly QuadroAgent[] | null;
  escritorio: Escritorio;
  map?: MapIndex | null;
}

/** All findings carry severity `error`; the TeamRegistry downgrades them to warnings at runtime. */
export function checkConsistency(input: ConsistencyInput): TeamDiagnostic[] {
  const out: TeamDiagnostic[] = [];
  const { escritorio: cfg, quadro, map } = input;
  const err = (
    code: string,
    file: 'escritorio.json' | 'QUADRO.md',
    message: string,
    path: string | undefined,
    params: Record<string, string>,
  ) =>
    out.push(diag(code, file, message, { severity: 'error', ...(path ? { path } : {}), params }));

  if (quadro) {
    const npcTypes = new Set(cfg.agents.map((a) => a.agentType));
    const quadroTypes = new Set(quadro.map((a) => a.agentType));
    for (const q of quadro) {
      if (!npcTypes.has(q.agentType))
        err(
          'team.agent-without-npc',
          'QUADRO.md',
          `agent "${q.agentType}" is in QUADRO.md but has no NPC in escritorio.json`,
          undefined,
          { agentType: q.agentType },
        );
    }
    cfg.agents.forEach((a, i) => {
      if (!quadroTypes.has(a.agentType))
        err(
          'team.npc-without-agent',
          'escritorio.json',
          `NPC "${a.agentType}" is not in QUADRO.md`,
          `agents.${i}.agentType`,
          { agentType: a.agentType },
        );
    });
  }

  cfg.agents.forEach((a, i) => {
    if (a.desk === null && !a.provisional)
      err(
        'team.desk-null-not-provisional',
        'escritorio.json',
        `agent "${a.agentType}" has no desk but is not marked provisional`,
        `agents.${i}.desk`,
        { agentType: a.agentType },
      );
  });

  if (map) {
    const deptRooms = new Map(cfg.departments.map((d) => [d.id, new Set(d.rooms)]));
    cfg.agents.forEach((a, i) => {
      if (a.desk === null) return;
      const desk = map.desks.get(a.desk);
      if (!desk) {
        err(
          'team.desk-missing-in-map',
          'escritorio.json',
          `desk "${a.desk}" of "${a.agentType}" does not exist in mapa.json`,
          `agents.${i}.desk`,
          { agentType: a.agentType, desk: a.desk },
        );
        return;
      }
      const rooms = deptRooms.get(a.department);
      if (rooms && !rooms.has(desk.room))
        err(
          'team.desk-wrong-room',
          'escritorio.json',
          `desk "${a.desk}" is in room "${desk.room}", which is not a room of department "${a.department}"`,
          `agents.${i}.desk`,
          { agentType: a.agentType, desk: a.desk, room: desk.room, department: a.department },
        );
    });
    cfg.departments.forEach((d, i) =>
      d.rooms.forEach((room, j) => {
        if (!map.rooms.has(room))
          err(
            'team.room-missing-in-map',
            'escritorio.json',
            `room "${room}" of department "${d.id}" does not exist in mapa.json`,
            `departments.${i}.rooms.${j}`,
            { department: d.id, room },
          );
      }),
    );
    if (!map.rooms.has(cfg.freelancer.homeRoom))
      err(
        'team.room-missing-in-map',
        'escritorio.json',
        `freelancer.homeRoom "${cfg.freelancer.homeRoom}" does not exist in mapa.json`,
        'freelancer.homeRoom',
        { room: cfg.freelancer.homeRoom },
      );
  }
  return out;
}
