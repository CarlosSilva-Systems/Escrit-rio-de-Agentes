import { describe, expect, it } from 'vitest';
import { OfficeEventSchema } from '../contracts';
import { createEventFactory, cleanAgentId } from './factory';
import { EventBus } from './bus';
import { EventDeduper } from './dedupe';
import { extractTaskRef, maskSecrets, safeSubject } from './mask';

describe('event factory (CA-15)', () => {
  it('CA-15: builds events that satisfy the OfficeEvent contract, with unique ids', () => {
    const make = createEventFactory({ now: () => 1000 });
    const a = make({ source: 'hook', kind: 'tool.pre', tool: { name: 'Edit', category: 'edit' } });
    const b = make({ source: 'jsonl', kind: 'turn.stop' });
    expect(OfficeEventSchema.safeParse(a).success).toBe(true);
    expect(OfficeEventSchema.safeParse(b).success).toBe(true);
    expect(a.id).not.toBe(b.id);
    expect(a.agent).toEqual({ agentType: null, agentId: null });
  });

  it('CA-18: agent ids are normalized so hooks and JSONL files agree', () => {
    expect(cleanAgentId('agent-abc123')).toBe('abc123');
    expect(cleanAgentId('abc123')).toBe('abc123');
    expect(cleanAgentId('bad id!')).toBeNull();
    expect(cleanAgentId(42)).toBeNull();
  });
});

describe('event bus', () => {
  it('a throwing listener does not break the others', () => {
    const bus = new EventBus();
    const seen: string[] = [];
    bus.on(() => {
      throw new Error('boom');
    });
    bus.on((e) => seen.push(e.kind));
    bus.emit(createEventFactory()({ source: 'hook', kind: 'session.start' }));
    expect(seen).toEqual(['session.start']);
    expect(bus.listenerErrors).toBe(1);
  });
});

describe('dedupe (ADR-0004 §2)', () => {
  const make = createEventFactory({ now: () => 5 });
  it('CA-15: the same tool use from two sources is one event, even minutes apart', () => {
    let t = 0;
    const d = new EventDeduper({ now: () => t });
    const ev = (source: 'hook' | 'jsonl') =>
      make({
        source,
        kind: 'tool.pre',
        sessionId: 's',
        tool: { name: 'Edit', category: 'edit', useId: 'toolu_1' },
      });
    expect(d.isDuplicate(ev('hook'))).toBe(false);
    t = 90_000;
    expect(d.isDuplicate(ev('jsonl'))).toBe(true);
  });

  it('events without stable id only collapse inside the short window', () => {
    let t = 0;
    const d = new EventDeduper({ now: () => t });
    const ev = () => make({ source: 'hook', kind: 'turn.stop', sessionId: 's' });
    expect(d.isDuplicate(ev())).toBe(false);
    t = 500;
    expect(d.isDuplicate(ev())).toBe(true);
    t = 5000;
    expect(d.isDuplicate(ev())).toBe(false);
  });

  it('memory is bounded', () => {
    const d = new EventDeduper({ now: () => 0, maxEntries: 10 });
    for (let i = 0; i < 100; i++) {
      d.isDuplicate(
        make({
          source: 'hook',
          kind: 'tool.pre',
          tool: { name: 'x', category: 'other', useId: `u${i}` },
        }),
      );
    }
    expect(d.size).toBeLessThanOrEqual(10);
  });
});

describe('mask (privacy)', () => {
  it('CA-64: secrets in a task subject are masked and the text is bounded', () => {
    const s = safeSubject('Build login token=abcdefghijklmnopqrstuvwxyz0123456789 now');
    expect(s).not.toContain('abcdefghijklmnopqrstuvwxyz');
    expect(safeSubject('word '.repeat(100))?.length).toBe(120);
    expect(maskSecrets('Authorization: Bearer abcdef123456789')).not.toContain('abcdef123456789');
    expect(safeSubject(42)).toBeUndefined();
  });
  it('extracts a plan task ref', () => {
    expect(extractTaskRef('doing T-12a now')).toBe('T-12a');
    expect(extractTaskRef('nothing')).toBeUndefined();
  });
});
