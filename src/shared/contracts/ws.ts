import { z } from 'zod';
import { DiagnosticSchema, epochMs } from './common';
import {
  ActivityItemSchema,
  ApprovalCardSchema,
  ChatModeSchema,
  NpcLogicalSchema,
  OfficeSnapshotSchema,
  PlanSummarySchema,
  ProjectSummarySchema,
  TeamViewSchema,
  UsageViewSchema,
} from './state';

// WebSocket `/ws` (ARQUITETURA §5.4). Server messages are batched every <=100 ms in
// `{t:"batch", items:[...]}`. The browser reads TOLERANTLY; the only thing the browser may
// send is `{t:"ping"}` (anything else is ignored by the server).

const ChatSessionStateSchema = z.object({
  id: z.string().min(1).max(64),
  projectName: z.string().min(1).max(100),
  mode: ChatModeSchema,
  state: z.enum(['starting', 'idle', 'busy', 'ended']),
  terminalInput: z.boolean(),
});

const ChatItemSchema = z.object({
  id: z.string().min(1).max(100),
  ts: epochMs,
  role: z.enum(['user', 'assistant', 'tool']),
  /** Transcript text shown transiently; never persisted by the office (privacy). */
  text: z.string().max(200_000).optional(),
  toolName: z.string().max(200).optional(),
});

const TokenRowSchema = z.object({
  key: z.string().max(200),
  input: z.number().nonnegative(),
  output: z.number().nonnegative(),
  cacheRead: z.number().nonnegative(),
  cacheCreation: z.number().nonnegative(),
});

export const ServerMessageSchema = z.discriminatedUnion('t', [
  z.object({
    t: z.literal('hello'),
    v: z.literal(1),
    serverVersion: z.string().max(40),
    now: epochMs,
  }),
  z.object({ t: z.literal('snapshot'), snapshot: OfficeSnapshotSchema }),
  z.object({ t: z.literal('npc.update'), npc: NpcLogicalSchema }),
  z.object({ t: z.literal('activity'), item: ActivityItemSchema }),
  z.object({ t: z.literal('approval.upsert'), approval: ApprovalCardSchema }),
  z.object({ t: z.literal('approval.remove'), id: z.string().min(1).max(64) }),
  z.object({ t: z.literal('project.upsert'), project: ProjectSummarySchema }),
  z.object({
    t: z.literal('rooms'),
    /** Project name per slot 0-3 (null = free) and the "+N" overflow. */
    slots: z.array(z.string().nullable()).length(4),
    overflow: z.array(z.string()),
  }),
  z.object({
    t: z.literal('plan.update'),
    project: z.string().min(1).max(100),
    plan: PlanSummarySchema,
  }),
  z.object({ t: z.literal('usage'), usage: UsageViewSchema.nullable() }),
  z.object({
    t: z.literal('tokens'),
    group: z.enum(['project', 'agent', 'day']),
    rows: z.array(TokenRowSchema),
  }),
  z.object({ t: z.literal('team'), team: TeamViewSchema }),
  z.object({ t: z.literal('chat.session'), session: ChatSessionStateSchema }),
  z.object({
    t: z.literal('chat.items'),
    sessionId: z.string().min(1).max(64),
    items: z.array(ChatItemSchema),
  }),
  z.object({
    t: z.literal('alert'),
    id: z.string().min(1).max(64),
    kind: z.enum(['usage-warning', 'usage-critical', 'project-complete', 'approval-expired']),
    /** Window or project the alert refers to. */
    subject: z.string().max(100).optional(),
    ts: epochMs,
  }),
  z.object({ t: z.literal('diag'), diagnostics: z.array(DiagnosticSchema) }),
]);
export type ServerMessage = z.infer<typeof ServerMessageSchema>;

/** Wire envelope: single message or a batch (<=100 ms). */
export const ServerEnvelopeSchema = z.union([
  z.object({ t: z.literal('batch'), items: z.array(ServerMessageSchema) }),
  ServerMessageSchema,
]);
export type ServerEnvelope = z.infer<typeof ServerEnvelopeSchema>;

/** Client to server on `/ws`: strict, ping only. */
export const ClientMessageSchema = z.strictObject({ t: z.literal('ping') });
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

/** Client to server on `/ws/terminal/:sessionId` (only with "allow input" on). Strict. */
export const TerminalClientMessageSchema = z.discriminatedUnion('t', [
  z.strictObject({
    t: z.literal('input'),
    data: z.string().refine((s) => new TextEncoder().encode(s).length <= 4096, 'max 4 kB'),
  }),
  z.strictObject({
    t: z.literal('resize'),
    cols: z.number().int().min(1).max(500),
    rows: z.number().int().min(1).max(200),
  }),
]);
export type TerminalClientMessage = z.infer<typeof TerminalClientMessageSchema>;
