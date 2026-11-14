import { z } from 'zod';
import { epochMs } from './common';
import { ActivityItemSchema, ChatModeSchema, PublicConfigSchema } from './state';
import { validateProjectName } from '../text/projectName';

// REST DTOs (ARQUITETURA §5.5). ACTION routes (POST/PATCH/DELETE bodies) are STRICT: unknown
// fields are rejected. Responses are read by the browser and stay tolerant. The browser never
// sends paths, commands, CLI arguments or environment variables (ADR-0005).

/** Validated project NAME (never a path). */
export const ProjectNameSchema = z.string().superRefine((value, ctx) => {
  const result = validateProjectName(value);
  if (!result.ok)
    ctx.addIssue({ code: 'custom', message: `invalid project name (${result.error})` });
});

const MAX_CHAT_BYTES = 32 * 1024;

// --- Auth / session ---

/** `POST /api/auth/ticket` (Bearer token, no Origin). */
export const AuthTicketResponseSchema = z.object({
  ticket: z.string().min(16).max(128),
  expiresInSec: z.number().int().positive().max(300),
});

/** `GET /auth/callback?ticket=` query. */
export const AuthCallbackQuerySchema = z.strictObject({ ticket: z.string().min(16).max(128) });

/** `GET /api/health`. */
export const HealthResponseSchema = z.object({ ok: z.literal(true), version: z.string().max(40) });

/** `GET /api/session`. */
export const SessionResponseSchema = z.object({
  csrfToken: z.string().min(16).max(128),
  lang: z.enum(['pt-BR', 'en']),
});

// --- Config ---

/** `PATCH /api/config`: closed list, every field optional, nothing else accepted. */
export const ConfigPatchSchema = z
  .strictObject({
    lang: PublicConfigSchema.shape.lang,
    sound: PublicConfigSchema.shape.sound,
    music: PublicConfigSchema.shape.music,
    quality: PublicConfigSchema.shape.quality,
    approvalDeadlineSec: PublicConfigSchema.shape.approvalDeadlineSec,
    /** Per project, keyed by a validated project name. */
    chatMode: z.record(ProjectNameSchema, ChatModeSchema),
    npcWorkPlace: PublicConfigSchema.shape.npcWorkPlace,
  })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, 'empty patch');
export type ConfigPatch = z.infer<typeof ConfigPatchSchema>;

// --- Projects ---

/** `POST /api/projects`. */
export const ProjectCreateRequestSchema = z.strictObject({ name: ProjectNameSchema });

export const ProjectSessionItemSchema = z.object({
  id: z.uuid(),
  startedAt: epochMs,
  title: z.string().max(80).optional(),
  messageCount: z.number().int().nonnegative(),
});
/** `GET /api/projects/:name/sessions`. */
export const ProjectSessionsResponseSchema = z.object({
  sessions: z.array(ProjectSessionItemSchema),
});

// --- Chat ---

/** `POST /api/chat/sessions`. */
export const ChatSessionCreateRequestSchema = z.strictObject({
  projectName: ProjectNameSchema,
  resumeSessionId: z.uuid().optional(),
  mode: ChatModeSchema.optional(),
});
export type ChatSessionCreateRequest = z.infer<typeof ChatSessionCreateRequestSchema>;

export const ChatSessionCreateResponseSchema = z.object({ id: z.uuid() });

/** `POST /api/chat/sessions/:id/messages` (<=32 kB). */
export const ChatMessageRequestSchema = z.strictObject({
  text: z
    .string()
    .min(1)
    .refine((s) => new TextEncoder().encode(s).length <= MAX_CHAT_BYTES, 'message above 32 kB'),
});

/** `POST /api/chat/sessions/:id/terminal-input`. */
export const TerminalInputRequestSchema = z.strictObject({ enabled: z.boolean() });

// --- Approvals ---

/** `POST /api/approvals/:id/decision`. */
export const ApprovalDecisionRequestSchema = z.strictObject({
  behavior: z.enum(['allow', 'deny']),
  message: z.string().max(500).optional(),
});
export type ApprovalDecisionRequest = z.infer<typeof ApprovalDecisionRequestSchema>;

/** `GET /api/approvals/:id/details`: masked details, never persisted. */
export const ApprovalDetailsResponseSchema = z.object({
  id: z.string(),
  toolName: z.string().max(200),
  /** Masked text, bounded. Markdown (plan approvals) is sanitized on the client. */
  details: z.string().max(20_000),
});

// --- Read routes ---

/** `GET /api/npcs/:key/history` (>=10 latest activities, metadata only). */
export const NpcHistoryResponseSchema = z.object({ items: z.array(ActivityItemSchema) });

/** `GET /api/tokens?group=project|agent|day&days=14`. */
export const TokensQuerySchema = z.strictObject({
  group: z.enum(['project', 'agent', 'day']).default('project'),
  days: z.coerce.number().int().min(1).max(400).default(14),
});

export const DiagResponseSchema = z.object({
  counters: z.record(z.string(), z.number()),
  clients: z.number().int().nonnegative().optional(),
});
