import { describe, expect, it } from 'vitest';
import {
  ApprovalDecisionRequestSchema,
  ChatMessageRequestSchema,
  ChatSessionCreateRequestSchema,
  ConfigPatchSchema,
  ProjectCreateRequestSchema,
  TerminalInputRequestSchema,
  TokensQuerySchema,
} from './rest';

describe('REST action contracts (strict)', () => {
  it('CA-27: project creation takes only a validated name', () => {
    expect(ProjectCreateRequestSchema.safeParse({ name: 'Novo Projeto' }).success).toBe(true);
  });

  it.each(['..', 'a/b', 'C:\\Windows', 'CON', '\\\\srv\\share', '', 'PROGRA~1'])(
    'CA-29: project name %j is rejected',
    (name) => {
      expect(ProjectCreateRequestSchema.safeParse({ name }).success).toBe(false);
    },
  );

  it('CA-31: the browser cannot smuggle a path or command into a request', () => {
    expect(ProjectCreateRequestSchema.safeParse({ name: 'ok', path: 'C:\\x' }).success).toBe(false);
    expect(
      ChatSessionCreateRequestSchema.safeParse({ projectName: 'ok', cwd: 'C:\\x' }).success,
    ).toBe(false);
    expect(
      ChatSessionCreateRequestSchema.safeParse({ projectName: 'ok', args: ['--dangerous'] })
        .success,
    ).toBe(false);
    expect(ChatMessageRequestSchema.safeParse({ text: 'hi', env: { A: 'b' } }).success).toBe(false);
  });

  it('CA-32: chat session creation accepts a resume uuid and a mode', () => {
    const parsed = ChatSessionCreateRequestSchema.safeParse({
      projectName: 'Sites',
      resumeSessionId: '3f1c2f9e-8a7b-4c1d-9b6e-2a5d7c8e9f10',
      mode: 'interactive',
    });
    expect(parsed.success).toBe(true);
  });

  it('CA-36: resumeSessionId must be a uuid (never a path)', () => {
    expect(
      ChatSessionCreateRequestSchema.safeParse({ projectName: 'Sites', resumeSessionId: '../x' })
        .success,
    ).toBe(false);
  });

  it('CA-32: chat message is limited to 32 kB (bytes, not characters)', () => {
    expect(ChatMessageRequestSchema.safeParse({ text: 'a'.repeat(32 * 1024) }).success).toBe(true);
    expect(ChatMessageRequestSchema.safeParse({ text: 'a'.repeat(32 * 1024 + 1) }).success).toBe(
      false,
    );
    // 11000 x 3-byte characters = 33000 bytes, above the limit despite being under 32768 chars.
    expect(ChatMessageRequestSchema.safeParse({ text: '€'.repeat(11000) }).success).toBe(false);
    expect(ChatMessageRequestSchema.safeParse({ text: '' }).success).toBe(false);
  });

  it('CA-33: terminal input toggle is a strict boolean', () => {
    expect(TerminalInputRequestSchema.safeParse({ enabled: true }).success).toBe(true);
    expect(TerminalInputRequestSchema.safeParse({ enabled: 'yes' }).success).toBe(false);
  });

  it('CA-38: approval decision accepts only allow or deny', () => {
    expect(ApprovalDecisionRequestSchema.safeParse({ behavior: 'allow' }).success).toBe(true);
    expect(
      ApprovalDecisionRequestSchema.safeParse({ behavior: 'deny', message: 'no' }).success,
    ).toBe(true);
    expect(ApprovalDecisionRequestSchema.safeParse({ behavior: 'ask' }).success).toBe(false);
    expect(
      ApprovalDecisionRequestSchema.safeParse({ behavior: 'allow', toolInput: {} }).success,
    ).toBe(false);
  });

  it('CA-31: config patch is a closed list and must not be empty', () => {
    expect(ConfigPatchSchema.safeParse({ lang: 'en', sound: true }).success).toBe(true);
    expect(ConfigPatchSchema.safeParse({}).success).toBe(false);
    expect(ConfigPatchSchema.safeParse({ claudeBin: 'C:\\evil.exe' }).success).toBe(false);
    expect(ConfigPatchSchema.safeParse({ approvalDeadlineSec: 9 }).success).toBe(false);
    expect(ConfigPatchSchema.safeParse({ approvalDeadlineSec: 301 }).success).toBe(false);
    expect(ConfigPatchSchema.safeParse({ approvalDeadlineSec: 120 }).success).toBe(true);
    expect(ConfigPatchSchema.safeParse({ lang: 'fr' }).success).toBe(false);
  });

  it('CA-34: per-project chat mode is keyed by a validated project name', () => {
    expect(ConfigPatchSchema.safeParse({ chatMode: { Sites: 'automatic' } }).success).toBe(true);
    expect(ConfigPatchSchema.safeParse({ chatMode: { '..': 'automatic' } }).success).toBe(false);
    expect(ConfigPatchSchema.safeParse({ chatMode: { Sites: 'yolo' } }).success).toBe(false);
  });

  it('CA-63: tokens query applies defaults and bounds', () => {
    expect(TokensQuerySchema.parse({})).toEqual({ group: 'project', days: 14 });
    expect(TokensQuerySchema.parse({ group: 'agent', days: '30' })).toEqual({
      group: 'agent',
      days: 30,
    });
    expect(TokensQuerySchema.safeParse({ group: 'user' }).success).toBe(false);
    expect(TokensQuerySchema.safeParse({ days: 0 }).success).toBe(false);
  });
});
