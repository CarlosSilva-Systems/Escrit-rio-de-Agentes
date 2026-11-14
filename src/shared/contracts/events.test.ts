import { describe, expect, it } from 'vitest';
import { categorizeTool, OfficeEventSchema } from './events';

const validEvent = {
  v: 1,
  id: 'ev-1',
  ts: 1_794_530_000_000,
  source: 'hook',
  kind: 'subagent.start',
  sessionId: 'sess-1',
  project: { kind: 'dev', name: 'Sites' },
  agent: { agentType: 'dev-web', agentId: 'agent-abc123' },
  tool: { name: 'Edit', category: 'edit', useId: 'toolu_1' },
  task: { ref: 'T-12', subject: 'Build the landing page' },
};

describe('OfficeEvent contract', () => {
  it('CA-15: accepts a complete normalized event', () => {
    expect(OfficeEventSchema.safeParse(validEvent).success).toBe(true);
  });

  it('CA-16: accepts the main thread (agentType null) and an unknown project', () => {
    const parsed = OfficeEventSchema.safeParse({
      ...validEvent,
      agent: { agentType: null, agentId: null },
      project: { kind: 'unknown' },
      tool: undefined,
      task: undefined,
    });
    expect(parsed.success).toBe(true);
  });

  it('CA-44: accepts a project outside 7 - DEV by basename', () => {
    const parsed = OfficeEventSchema.safeParse({
      ...validEvent,
      project: { kind: 'outside', basename: 'other-folder' },
    });
    expect(parsed.success).toBe(true);
  });

  it.each([
    ['unknown kind', { kind: 'tool.exploded' }],
    ['wrong protocol version', { v: 2 }],
    ['negative timestamp', { ts: -1 }],
    ['unknown source', { source: 'browser' }],
    ['task subject above 120 chars', { task: { subject: 'x'.repeat(121) } }],
    ['bad tool category', { tool: { name: 'Edit', category: 'magic' } }],
    ['project kind dev without name', { project: { kind: 'dev' } }],
  ])('CA-15: rejects %s', (_label, patch) => {
    expect(OfficeEventSchema.safeParse({ ...validEvent, ...patch }).success).toBe(false);
  });
});

describe('categorizeTool', () => {
  it.each([
    ['Edit', 'edit'],
    ['Write', 'edit'],
    ['MultiEdit', 'edit'],
    ['NotebookEdit', 'edit'],
    ['Read', 'read'],
    ['Grep', 'read'],
    ['Glob', 'read'],
    ['LS', 'read'],
    ['Bash', 'bash'],
    ['PowerShell', 'bash'],
    ['WebFetch', 'web'],
    ['WebSearch', 'web'],
    ['Agent', 'delegate'],
    ['Task', 'delegate'],
    ['TaskCreate', 'task'],
    ['TaskUpdate', 'task'],
    ['TaskList', 'task'],
    ['TaskGet', 'task'],
    ['TodoWrite', 'task'],
    ['ExitPlanMode', 'plan'],
    ['EnterPlanMode', 'plan'],
    ['mcp__server__tool', 'other'],
    ['SomethingNew', 'other'],
    ['toString', 'other'],
  ])('CA-15: %s is %s', (name, category) => {
    expect(categorizeTool(name)).toBe(category);
  });

  it('CA-15: missing tool name is other', () => {
    expect(categorizeTool(undefined)).toBe('other');
    expect(categorizeTool(null)).toBe('other');
    expect(categorizeTool('')).toBe('other');
  });
});
