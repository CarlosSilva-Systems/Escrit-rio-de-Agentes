import { describe, expect, it } from 'vitest';
import { decodeCollision, type Tile } from '../world/grid';
import { findPath } from '../world/pathfinding';
import { buildProvisionalMap } from '../world/provisionalMap';
import {
  applyStatus,
  CELEBRATE_MS,
  createActor,
  poseOf,
  SLEEPY_AFTER_MS,
  startArriving,
  startLeaving,
  stepActor,
  statusTextKey,
  type NpcActor,
  type NpcEnv,
} from './actor';
import { SeatAllocator } from './seats';

const map = buildProvisionalMap();
const grid = decodeCollision(map.collision, map.cols, map.rows);
const queueTiles: Tile[] = map.spawn.approvalQueue.map((id) => {
  const t = map.pois.find((p) => p.id === id)?.tiles[0] as Tile;
  return [t[0], t[1]];
});

function makeEnv(overrides: Partial<NpcEnv> = {}): NpcEnv & { taken: Set<number> } {
  const taken = new Set<number>();
  return {
    taken,
    findPath: (from, to) => findPath(grid, from, to, { allowBlockedGoal: true }),
    entrance: [8, 51],
    counter: [8, 47],
    queueTiles,
    claimQueue(key) {
      void key;
      for (let i = 0; i < queueTiles.length; i++)
        if (!taken.has(i)) {
          taken.add(i);
          return i;
        }
      return null;
    },
    releaseQueue: () => undefined,
    reducedMotion: false,
    ...overrides,
  };
}

const allocator = () => new SeatAllocator(map);
const deskOf = (id: string) => {
  const a = allocator();
  return a.claim('x', { agentType: 'x', desk: id }) as NonNullable<
    ReturnType<SeatAllocator['claim']>
  >;
};
const run = (a: NpcActor, env: NpcEnv, ms: number, step = 33) => {
  for (let t = 0; t < ms; t += step) stepActor(a, step, env);
};

describe('seat allocation', () => {
  it('CA-21: configured desks are kept; the rest go to free desks of their department', () => {
    const al = allocator();
    al.claimTeam([
      { key: 'chefe', member: { agentType: 'chefe', department: 'diretoria', isLead: true } },
      { key: 'a', member: { agentType: 'a', department: 'engenharia' } },
      { key: 'b', member: { agentType: 'b', department: 'engenharia', desk: 'ENG-03' } },
      { key: 'c', member: { agentType: 'c', department: 'engenharia' } },
    ]);
    expect(al.seatFor('chefe')?.id).toBe('DIR-00');
    expect(al.seatFor('b')?.id).toBe('ENG-03');
    expect(al.seatFor('a')?.id).toBe('ENG-01');
    expect(al.seatFor('c')?.id).toBe('ENG-02');
  });

  it('CA-21: a department without a free desk uses the provisional Reception desks, then other free seats', () => {
    const al = allocator();
    const claimed = Array.from({ length: 4 }, (_, i) =>
      al.claim(`n${i}`, { agentType: 'n', department: 'diretoria' }),
    );
    expect(claimed.every(Boolean)).toBe(true);
    expect(claimed[0]?.id).toBe('DIR-00');
    expect(claimed[1]?.id).toBe('FL-D1');
    expect(claimed[2]?.id).toBe('FL-D2');
    expect(new Set(claimed.map((c) => c?.id)).size).toBe(4);
  });

  it('CA-17: Freelancers sit at the Reception first and never share a seat', () => {
    const al = allocator();
    const ids = Array.from({ length: 4 }, (_, i) => al.claimVisitor(`f${i}`)?.id);
    expect(ids.slice(0, 2)).toEqual(['FL-D1', 'FL-D2']);
    expect(new Set(ids).size).toBe(4);
    al.release('f0');
    expect(al.claimVisitor('f9')?.id).toBe('FL-D1');
  });

  it('CA-21: a released seat can be reused (farewell)', () => {
    const al = allocator();
    al.claim('x', { agentType: 'x', desk: 'ENG-01' });
    al.release('x');
    expect(al.claim('y', { agentType: 'y', desk: 'ENG-01' })?.id).toBe('ENG-01');
  });
});

describe('NPC state machine', () => {
  it('CA-15: starts at the desk, seated and facing the desk direction', () => {
    const a = createActor('dev-web', deskOf('ENG-01'));
    expect(a.mode).toBe('atDesk');
    expect([a.x, a.y]).toEqual([3 * 16, 17 * 16]);
    expect(poseOf(a, false)).toMatchObject({ anim: 'sit', dir: 's', icon: null });
  });

  it('CA-69: working at the desk types for edit/bash and reads for read/web, with the gear icon', () => {
    const env = makeEnv();
    for (const [tool, anim] of [
      ['edit', 'type'],
      ['bash', 'type'],
      ['read', 'read'],
      ['web', 'read'],
      ['delegate', 'type'],
      [undefined, 'type'],
    ] as const) {
      const a = createActor('k', deskOf('ENG-01'));
      applyStatus(a, 'working', tool, env);
      expect(a.mode).toBe('working');
      const pose = poseOf(a, false);
      expect(pose.anim, String(tool)).toBe(anim);
      expect(pose.icon).toBe('gear');
    }
  });

  it('CA-15: an NPC away from its desk walks back to it before working, then types', () => {
    const env = makeEnv();
    const a = createActor('k', deskOf('ENG-01'));
    // Put the NPC at the reception counter, as after a welcome scene.
    a.tile = [8, 47];
    a.x = 8 * 16;
    a.y = 47 * 16;
    applyStatus(a, 'working', 'edit', env);
    expect(a.mode).toBe('goingToWork');
    expect(poseOf(a, false).anim).toBe('walk');
    run(a, env, 60_000);
    expect(a.mode).toBe('working');
    expect(a.tile).toEqual([3, 17]);
  });

  it('CA-16: Stop -> celebrating for 1.5 s -> back to normal at the desk', () => {
    const env = makeEnv();
    const a = createActor('k', deskOf('ENG-01'));
    applyStatus(a, 'working', 'edit', env);
    applyStatus(a, 'idle', undefined, env);
    expect(a.mode).toBe('celebrating');
    expect(poseOf(a, false).anim).toBe('idle');
    run(a, env, CELEBRATE_MS - 100);
    expect(a.mode).toBe('celebrating');
    run(a, env, 300);
    expect(a.mode).toBe('atDesk');
    expect(poseOf(a, false).icon).toBeNull();
  });

  it('CA-22: reduced motion never hops and never walks (snaps to the destination)', () => {
    const env = makeEnv({ reducedMotion: true });
    const a = createActor('k', deskOf('ENG-01'));
    a.tile = [8, 47];
    a.x = 128;
    a.y = 752;
    applyStatus(a, 'working', 'edit', env);
    expect(a.mode).toBe('working');
    expect(a.path).toBeNull();
    expect(a.tile).toEqual([3, 17]);
    applyStatus(a, 'idle', undefined, env);
    expect(a.mode).toBe('atDesk');
    const hopped = createActor('h', deskOf('ENG-01'));
    hopped.mode = 'celebrating';
    hopped.modeMs = 200;
    expect(poseOf(hopped, true).hop).toBe(0);
    expect(poseOf(hopped, false).hop).toBeLessThanOrEqual(0);
  });

  it('CA-71: awaiting approval walks to the first free FILA tile, waits facing west with the "!" icon', () => {
    const env = makeEnv();
    const a = createActor('k', deskOf('ENG-01'));
    applyStatus(a, 'awaiting', 'bash', env);
    expect(a.mode).toBe('goingToQueue');
    run(a, env, 120_000);
    expect(a.mode).toBe('awaiting');
    expect(a.tile).toEqual(queueTiles[0]);
    const pose = poseOf(a, false);
    expect(pose).toMatchObject({ anim: 'idle', dir: 'w', icon: 'alert' });
    expect(pose.iconBob).toBeLessThanOrEqual(0);
  });

  it('CA-71: decided/expired -> leaves the queue and goes back to the desk (Awaiting beats Working)', () => {
    const env = makeEnv();
    const a = createActor('k', deskOf('ENG-01'));
    applyStatus(a, 'working', 'edit', env);
    applyStatus(a, 'awaiting', 'edit', env);
    expect(a.mode).toBe('goingToQueue');
    run(a, env, 120_000);
    applyStatus(a, 'working', 'edit', env);
    expect(a.mode).toBe('goingToWork');
    run(a, env, 120_000);
    expect(a.mode).toBe('working');
    expect(a.tile).toEqual([3, 17]);
  });

  it('CA-71: with all 8 queue places taken the 9th waits at its desk with the "!"', () => {
    const env = makeEnv();
    const actors = Array.from({ length: 9 }, (_, i) => createActor(`k${i}`, deskOf('ENG-01')));
    actors.forEach((a) => applyStatus(a, 'awaiting', 'bash', env));
    const ninth = actors[8] as NpcActor;
    expect(actors.slice(0, 8).every((a) => a.mode === 'goingToQueue')).toBe(true);
    expect(ninth.mode).toBe('awaitingAtDesk');
    expect(poseOf(ninth, false).icon).toBe('alert');
  });

  it('CA-71: repeating the same status is idempotent', () => {
    const env = makeEnv();
    const a = createActor('k', deskOf('ENG-01'));
    applyStatus(a, 'awaiting', undefined, env);
    applyStatus(a, 'awaiting', undefined, env);
    expect(env.taken.size).toBe(1);
  });

  it('CA-21: welcome scene walks entrance -> counter (pause) -> desk, then applies a queued status', () => {
    const env = makeEnv();
    const a = createActor('new', deskOf('QUA-V1'));
    startArriving(a, env);
    expect(a.mode).toBe('arriving');
    expect(a.tile).not.toEqual(a.desk.tile);
    applyStatus(a, 'working', 'read', env);
    expect(a.pending).toEqual({ status: 'working', tool: 'read' });
    let sawCounter = false;
    for (let t = 0; t < 120_000 && a.mode === 'arriving'; t += 33) {
      stepActor(a, 33, env);
      if (!a.path && a.tile[0] === 8 && a.tile[1] === 47) sawCounter = true;
    }
    expect(sawCounter).toBe(true);
    run(a, env, 5_000);
    expect(a.mode).toBe('working');
    expect(a.tile).toEqual(a.desk.tile);
  });

  it('CA-17: Freelancer leaving walks to the entrance and is gone', () => {
    const env = makeEnv();
    const a = createActor('freelancer:1', deskOf('FL-D1'));
    startLeaving(a, env);
    expect(a.mode).toBe('leaving');
    run(a, env, 120_000);
    expect(a.mode).toBe('gone');
    expect(a.tile).toEqual([8, 51]);
  });

  it('CA-22: with reduced motion arrival and farewell are instant', () => {
    const env = makeEnv({ reducedMotion: true });
    const a = createActor('n', deskOf('QUA-V1'));
    startArriving(a, env);
    expect(a.mode).toBe('atDesk');
    startLeaving(a, env);
    expect(a.mode).toBe('gone');
  });

  it('CA-74: sitting idle for 30 min shows the "zzz" icon and the "sleepy" status text', () => {
    const env = makeEnv();
    const a = createActor('k', deskOf('ENG-01'));
    expect(poseOf(a, false).icon).toBeNull();
    for (let t = 0; t < SLEEPY_AFTER_MS + 1000; t += 10_000) stepActor(a, 10_000, env);
    expect(poseOf(a, false).icon).toBe('zzz');
    expect(statusTextKey(a, 'idle')).toBe('sleepy');
    expect(statusTextKey(a, 'working')).toBe('working');
    expect(statusTextKey(a, 'awaiting')).toBe('awaiting');
  });

  it('CA-15: walking never leaves walkable tiles and moves at 48 px/s', () => {
    const env = makeEnv();
    const a = createActor('k', deskOf('ENG-01'));
    a.tile = [8, 47];
    a.x = 128;
    a.y = 752;
    applyStatus(a, 'working', 'edit', env);
    let px = a.x;
    let py = a.y;
    while (a.mode === 'goingToWork') {
      stepActor(a, 33, env);
      expect(Math.hypot(a.x - px, a.y - py)).toBeLessThanOrEqual(1.7);
      px = a.x;
      py = a.y;
    }
  });

  it('CA-71: while returning, only the latest status survives: returning + working', () => {
    const env = makeEnv();
    const a = createActor('k', deskOf('ENG-01'));
    applyStatus(a, 'awaiting', 'bash', env);
    run(a, env, 120_000);
    applyStatus(a, 'idle', undefined, env); // leaves the queue, starts returning
    expect(a.mode).toBe('returning');
    applyStatus(a, 'working', 'read', env);
    expect(a.pending).toEqual({ status: 'working', tool: 'read' });
    run(a, env, 120_000);
    expect(a.mode).toBe('working');
    expect(a.pending).toBeNull();
  });

  it('CA-71: returning + idle ends seated and idle, with no stale pending status', () => {
    const env = makeEnv();
    const a = createActor('k', deskOf('ENG-01'));
    applyStatus(a, 'awaiting', 'bash', env);
    run(a, env, 120_000);
    applyStatus(a, 'idle', undefined, env);
    applyStatus(a, 'working', 'edit', env);
    applyStatus(a, 'idle', undefined, env); // latest wins
    run(a, env, 120_000);
    expect(a.mode).toBe('atDesk');
    expect(a.pending).toBeNull();
  });

  it('CA-71: a status applied on a non-returning path clears an old pending one', () => {
    const env = makeEnv();
    const a = createActor('k', deskOf('ENG-01'));
    a.pending = { status: 'awaiting', tool: undefined };
    applyStatus(a, 'working', 'edit', env);
    expect(a.pending).toBeNull();
  });

  it('CA-15: re-planning mid-walk continues from the current position (no jump back)', () => {
    const env = makeEnv();
    const a = createActor('k', deskOf('ENG-01'));
    a.tile = [8, 47];
    a.x = 128;
    a.y = 752;
    applyStatus(a, 'working', 'edit', env);
    run(a, env, 700);
    expect(a.path).not.toBeNull();
    const { x, y } = a;
    applyStatus(a, 'awaiting', 'edit', env); // new destination while walking
    expect(Math.hypot(a.x - x, a.y - y)).toBe(0);
    stepActor(a, 33, env);
    expect(Math.hypot(a.x - x, a.y - y)).toBeLessThanOrEqual(1.7);
    run(a, env, 120_000);
    expect(a.mode).toBe('awaiting');
  });
});
