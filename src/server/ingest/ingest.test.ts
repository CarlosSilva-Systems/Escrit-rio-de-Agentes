import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OfficeEventSchema, type OfficeEvent } from '../../shared/contracts';
import { EventBus } from '../../shared/events';
import { IngestService } from './service';

const dir = join(import.meta.dirname, '..', '..', '..', 'tests', 'fixtures', 'hooks');
const fixture = (name: string): unknown => JSON.parse(readFileSync(join(dir, name), 'utf8'));
const DEV_ROOT = 'D:\\fake\\7 - DEV';

function setup() {
  const bus = new EventBus();
  const events: OfficeEvent[] = [];
  bus.on((e) => events.push(e));
  let now = 1_000_000;
  const ingest = new IngestService({ bus, devRoot: DEV_ROOT, now: () => now });
  return {
    ingest,
    events,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe('hook ingest (T-16)', () => {
  it('CA-15: SubagentStart becomes subagent.start with agent, session and project under 7 - DEV', () => {
    const { ingest, events } = setup();
    const raw = { ...(fixture('subagent-start.json') as object), cwd: `${DEV_ROOT}\\Sites\\src` };
    expect(ingest.ingestHook(raw)).toBe('accepted');
    const [e] = events;
    expect(OfficeEventSchema.safeParse(e).success).toBe(true);
    expect(e).toMatchObject({
      kind: 'subagent.start',
      source: 'hook',
      agent: { agentType: 'dev-web', agentId: 'abc123' },
      project: { kind: 'dev', name: 'Sites' },
    });
  });

  it('CA-17: a subagent without a usable agent_type is "unknown"; the main thread keeps null', () => {
    const { ingest, events } = setup();
    ingest.ingestHook(fixture('subagent-start-no-type.json'));
    ingest.ingestHook(fixture('user-prompt-submit.json'));
    expect(events[0]?.agent).toEqual({ agentType: 'unknown', agentId: 'zz9freelance' });
    expect(events[1]?.agent).toEqual({ agentType: null, agentId: null });
    expect(events[1]?.kind).toBe('prompt.submit');
  });

  it('CA-15: tool events carry only name, category and id', () => {
    const { ingest, events } = setup();
    ingest.ingestHook(fixture('pre-tool-use.json'));
    expect(events[0]?.tool).toEqual({ name: 'Bash', category: 'bash', useId: 'toolu_01ABC' });
  });

  it('CA-15: tolerant: wrong types, future fields, missing event name never throw', () => {
    const { ingest } = setup();
    expect(ingest.ingestHook(fixture('wrong-types.json'))).toBe('accepted');
    expect(ingest.ingestHook(fixture('future-fields.json'))).toBe('accepted');
    expect(ingest.ingestHook(fixture('missing-event-name.json'))).toBe('invalid');
    expect(ingest.ingestHook(undefined)).toBe('invalid');
    expect(ingest.ingestHook('text')).toBe('invalid');
    expect(ingest.ingestHook({ hook_event_name: 'TeammateIdle' })).toBe('ignored');
    expect(ingest.counters.get('ingest.invalid')).toBe(3);
  });

  it('CA-15: duplicates (same tool use from two hook sources) count once', () => {
    const { ingest, events, advance } = setup();
    expect(ingest.ingestHook(fixture('pre-tool-use.json'))).toBe('accepted');
    advance(50);
    expect(ingest.ingestHook(fixture('pre-tool-use.json'))).toBe('duplicate');
    expect(events).toHaveLength(1);
    expect(ingest.counters.get('ingest.duplicate')).toBe(1);
  });

  it('CA-64: privacy: no prompt, tool input/output or assistant text survives normalization', () => {
    const { ingest, events } = setup();
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.json'))) {
      ingest.ingestHook(fixture(f));
    }
    const dump = JSON.stringify(events);
    expect(events.length).toBeGreaterThan(10);
    expect(dump).not.toContain('CANARY');
    expect(dump).not.toContain('SYNTHETIC-NOT-A-SECRET');
    expect(dump).not.toContain('abcdefghijklmnopqrstuvwxyz0123456789');
  });

  it('CA-15: task events keep the plan ref and a masked short subject', () => {
    const { ingest, events } = setup();
    ingest.ingestHook(fixture('task-created.json'));
    expect(events[0]?.task?.ref).toBe('T-12');
    expect(events[0]?.task?.subject).toMatch(/^Build login/);
  });
});
