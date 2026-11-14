// Seat allocation (MAPA.md §6, CA-21): where each NPC sits. Pure.
// Order for a team member: the desk named by the config; else a free desk of the member's
// department (real desks before vacancies); else a provisional Reception desk; else any free desk
// or seat. Freelancers use the Reception first.

import type { Mapa } from '../contracts/mapa';
import type { Tile } from '../world/grid';

export type Facing = 'north' | 'south' | 'east' | 'west';

export interface SeatSpot {
  id: string;
  tile: Tile;
  facing: Facing;
  provisional: boolean;
}

export interface MemberRef {
  agentType: string;
  department?: string | null;
  /** Desk id from escritorio.json; null/absent = none assigned. */
  desk?: string | null;
  isLead?: boolean;
}

export class SeatAllocator {
  private readonly spots = new Map<
    string,
    SeatSpot & { department?: string; vacancy: boolean; kind: string }
  >();
  private readonly owner = new Map<string, string>(); // seat id -> npc key
  private readonly seatOf = new Map<string, string>(); // npc key -> seat id

  constructor(private readonly map: Mapa) {
    for (const d of map.desks) {
      this.spots.set(d.id, {
        id: d.id,
        tile: [d.seat[0], d.seat[1]],
        facing: d.facing,
        provisional: d.id.startsWith('FL-D'),
        ...(d.department ? { department: d.department } : {}),
        vacancy: Boolean(d.vacancy),
        kind: 'desk',
      });
    }
    for (const s of map.seats) {
      if (s.kind === 'meeting' || s.kind === 'project') continue;
      this.spots.set(s.id, {
        id: s.id,
        tile: [s.tile[0], s.tile[1]],
        facing: s.facing,
        provisional: true,
        vacancy: true,
        kind: s.kind,
      });
    }
  }

  seatFor(key: string): SeatSpot | null {
    const id = this.seatOf.get(key);
    return id ? (this.spots.get(id) ?? null) : null;
  }

  release(key: string): void {
    const id = this.seatOf.get(key);
    if (id) this.owner.delete(id);
    this.seatOf.delete(key);
  }

  private take(key: string, id: string): SeatSpot | null {
    const spot = this.spots.get(id);
    if (!spot || this.owner.has(id)) return null;
    this.release(key);
    this.owner.set(id, key);
    this.seatOf.set(key, id);
    return spot;
  }

  private firstFree(
    pred: (s: SeatSpot & { department?: string; vacancy: boolean; kind: string }) => boolean,
  ) {
    for (const s of this.spots.values()) if (!this.owner.has(s.id) && pred(s)) return s;
    return undefined;
  }

  /** Exact desk (if named and free), else department desk, Reception desk, any free desk/seat. */
  claim(key: string, member: MemberRef): SeatSpot | null {
    const existing = this.seatFor(key);
    if (existing) return existing;
    if (member.desk && this.spots.has(member.desk) && !this.owner.has(member.desk)) {
      return this.take(key, member.desk);
    }
    const dept = member.department ?? undefined;
    const candidates = [
      dept
        ? this.firstFree((s) => s.kind === 'desk' && s.department === dept && !s.vacancy)
        : undefined,
      dept ? this.firstFree((s) => s.kind === 'desk' && s.department === dept) : undefined,
      this.firstFree((s) => s.id.startsWith('FL-D')),
      this.firstFree((s) => s.kind === 'desk' && s.vacancy),
      this.firstFree(() => true),
    ];
    const found = candidates.find(Boolean);
    return found ? this.take(key, found.id) : null;
  }

  /** Freelancer: Reception desks, then the waiting sofa, then any free place. */
  claimVisitor(key: string): SeatSpot | null {
    const existing = this.seatFor(key);
    if (existing) return existing;
    const found =
      this.firstFree((s) => s.id.startsWith('FL-D')) ??
      this.firstFree((s) => s.kind === 'sofa') ??
      this.firstFree((s) => s.kind === 'desk' && s.vacancy) ??
      this.firstFree(() => true);
    return found ? this.take(key, found.id) : null;
  }

  /** First pass of a team: members with an exact desk keep it before anyone else picks. */
  claimTeam(members: readonly { key: string; member: MemberRef }[]): void {
    for (const { key, member } of members) {
      if (member.desk && !this.owner.has(member.desk)) this.take(key, member.desk);
    }
    const ordered = [...members].sort(
      (a, b) => Number(Boolean(b.member.isLead)) - Number(Boolean(a.member.isLead)),
    );
    for (const { key, member } of ordered) this.claim(key, member);
  }
}
