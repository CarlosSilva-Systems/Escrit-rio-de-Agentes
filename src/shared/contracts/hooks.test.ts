import { describe, expect, it } from 'vitest';
import subagentStart from '../../../tests/fixtures/hooks/subagent-start.json';
import preToolUse from '../../../tests/fixtures/hooks/pre-tool-use.json';
import permissionRequest from '../../../tests/fixtures/hooks/permission-request.json';
import futureFields from '../../../tests/fixtures/hooks/future-fields.json';
import wrongTypes from '../../../tests/fixtures/hooks/wrong-types.json';
import missingEventName from '../../../tests/fixtures/hooks/missing-event-name.json';
import {
  ApprovalCreateResponseSchema,
  ApprovalWaitResponseSchema,
  parseHookPayload,
} from './hooks';

describe('hook payload contract (tolerant)', () => {
  it.each([
    ['SubagentStart', subagentStart],
    ['PreToolUse', preToolUse],
    ['PermissionRequest', permissionRequest],
  ])('CA-15: accepts a real-shaped %s payload', (_name, raw) => {
    const result = parseHookPayload(raw);
    expect(result.ok).toBe(true);
  });

  it('CA-15: keeps agent_type and agent_id of a SubagentStart', () => {
    const result = parseHookPayload(subagentStart);
    expect(result.ok && result.payload.agent_type).toBe('dev-web');
    expect(result.ok && result.payload.agent_id).toBe('agent-abc123');
  });

  it('CA-18: keeps unknown fields instead of rejecting them', () => {
    const result = parseHookPayload(futureFields);
    expect(result.ok).toBe(true);
    expect(result.ok && (result.payload as Record<string, unknown>).brand_new_field).toEqual({
      nested: [1, 2, 3],
    });
  });

  it('CA-18: wrongly typed optional fields become undefined, not a failure', () => {
    const result = parseHookPayload(wrongTypes);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.hook_event_name).toBe('Stop');
      expect(result.payload.session_id).toBeUndefined();
      expect(result.payload.agent_type).toBeUndefined();
      expect(result.payload.cwd).toBeUndefined();
    }
  });

  it('CA-18: a payload without hook_event_name is invalid (counted, never thrown)', () => {
    expect(parseHookPayload(missingEventName)).toEqual({ ok: false });
  });

  it.each([null, undefined, 42, 'text', [], true])('CA-18: never throws on %j', (raw) => {
    expect(() => parseHookPayload(raw)).not.toThrow();
    expect(parseHookPayload(raw).ok).toBe(false);
  });
});

describe('approval hook routes', () => {
  it('CA-37: accepts a creation response with a 128-bit id', () => {
    const parsed = ApprovalCreateResponseSchema.safeParse({
      id: 'qJ3x9fL0mZpT2vB7cN5wKA',
      deadline: 1_794_530_000_000,
    });
    expect(parsed.success).toBe(true);
  });

  it('CA-37: rejects a creation response with a weak id', () => {
    expect(ApprovalCreateResponseSchema.safeParse({ id: '1', deadline: 1 }).success).toBe(false);
  });

  it('CA-38: wait response only carries allow or deny', () => {
    expect(ApprovalWaitResponseSchema.safeParse({ behavior: 'allow' }).success).toBe(true);
    expect(ApprovalWaitResponseSchema.safeParse({ behavior: 'ask' }).success).toBe(false);
  });
});
