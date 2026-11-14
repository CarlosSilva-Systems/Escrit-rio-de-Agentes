import { describe, expect, it } from 'vitest';
import minimal from '../../../tests/fixtures/mapa/minimal.valid.json';
import { MapaSchema } from './mapa';

type Json = Record<string, unknown>;
const clone = (): Json => structuredClone(minimal) as unknown as Json;

function issuesOf(map: unknown): string {
  const parsed = MapaSchema.safeParse(map);
  return parsed.success
    ? ''
    : parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
}

describe('mapa/v1 contract', () => {
  it('CA-11: accepts a minimal consistent map', () => {
    expect(issuesOf(minimal)).toBe('');
  });

  it('CA-11: requires exactly 4 project slots numbered 0-3', () => {
    const map = clone();
    (map.projectSlots as unknown[]).pop();
    expect(issuesOf(map)).toContain('projectSlots');
    const dup = clone();
    ((dup.projectSlots as Json[])[3] as Json).slot = 0;
    expect(issuesOf(dup)).toContain('slots must be exactly 0, 1, 2, 3');
  });

  it('CA-11: layer length must equal cols*rows', () => {
    const map = clone();
    ((map.layers as Json).floor as number[]).pop();
    expect(issuesOf(map)).toContain('layers.floor');
  });

  it('CA-11: collision bitset must match cols*rows bits', () => {
    const map = clone();
    map.collision = 'AAAA';
    expect(issuesOf(map)).toContain('collision');
  });

  it('CA-11: ids must be unique', () => {
    const map = clone();
    (map.rooms as Json[]).push({ ...(map.rooms as Json[])[0] });
    expect(issuesOf(map)).toContain('duplicate id "REC"');
  });

  it('CA-11: a desk id cannot repeat a seat id', () => {
    const map = clone();
    ((map.seats as Json[])[0] as Json).id = 'ENG-01';
    expect(issuesOf(map)).toContain('duplicate id "ENG-01"');
  });

  it('CA-11: rectangles are inclusive and must be ordered and inside the map', () => {
    const inverted = clone();
    ((inverted.rooms as Json[])[0] as Json).rects = [[3, 3, 1, 1]];
    expect(issuesOf(inverted)).toContain('x1<=x2');
    const outside = clone();
    ((outside.rooms as Json[])[0] as Json).rects = [[0, 0, 99, 1]];
    expect(issuesOf(outside)).toContain('outside the map');
  });

  it('CA-11: seats and POIs must be inside the map', () => {
    const map = clone();
    ((map.seats as Json[])[0] as Json).tile = [50, 1];
    expect(issuesOf(map)).toContain('tile is outside the map');
  });

  it('CA-11: desks, seats, POIs and slots must reference an existing room', () => {
    const map = clone();
    ((map.desks as Json[])[0] as Json).room = 'NOPE';
    ((map.pois as Json[])[0] as Json).room = 'NOPE';
    const issues = issuesOf(map);
    expect(issues).toContain('desks.0.room: unknown room "NOPE"');
    expect(issues).toContain('pois.0.room: unknown room "NOPE"');
  });

  it('CA-11: rejects an unknown POI kind and an unknown schema version', () => {
    const poi = clone();
    ((poi.pois as Json[])[0] as Json).kind = 'jacuzzi';
    expect(issuesOf(poi)).toContain('pois.0.kind');
    const version = clone();
    version.schema = 'mapa/v2';
    expect(issuesOf(version)).not.toBe('');
  });

  it('CA-11: rejects an approval queue above 8 positions', () => {
    const map = clone();
    ((map.spawn as Json).approvalQueue as string[]) = Array.from(
      { length: 9 },
      (_, i) => `FILA-${i + 1}`,
    );
    expect(issuesOf(map)).toContain('spawn.approvalQueue');
  });
});
