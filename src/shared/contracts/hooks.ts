import { z } from 'zod';

// Hook payload sent by Claude Code (ARQUITETURA §5.1). TOLERANT: unknown fields are kept
// (loose object), wrongly typed optional fields become `undefined` instead of failing the
// whole payload. Only `hook_event_name` is required. `tool_input` must NEVER be logged or
// persisted; `last_assistant_message` is ignored (privacy).

const lenientString = z.string().optional().catch(undefined);

export const HookPayloadSchema = z.looseObject({
  hook_event_name: z.string().min(1),
  session_id: lenientString,
  transcript_path: lenientString,
  cwd: lenientString,
  permission_mode: lenientString,
  agent_id: lenientString,
  agent_type: lenientString,
  tool_name: lenientString,
  tool_use_id: lenientString,
  tool_input: z.unknown().optional(),
  notification_type: lenientString,
  last_assistant_message: z.unknown().optional(),
  task: z.unknown().optional(), // shape confirmed by spike S-03
});
export type HookPayload = z.infer<typeof HookPayloadSchema>;

export type ParsedHookPayload = { ok: true; payload: HookPayload } | { ok: false };

/** Never throws. A failure means "count ingest.invalid and answer 202". */
export function parseHookPayload(raw: unknown): ParsedHookPayload {
  const result = HookPayloadSchema.safeParse(raw);
  return result.success ? { ok: true, payload: result.data } : { ok: false };
}

// --- Approval routes used only by the hook script (hook-token, no Origin) ---

/** `POST /api/hooks/v1/approvals`: the body is the raw PermissionRequest payload. */
export const ApprovalCreateRequestSchema = HookPayloadSchema;

/** 201 response of `POST /api/hooks/v1/approvals`. */
export const ApprovalCreateResponseSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{22,64}$/),
  deadline: z.number().int().nonnegative(),
});
export type ApprovalCreateResponse = z.infer<typeof ApprovalCreateResponseSchema>;

/** 200 response of `GET /api/hooks/v1/approvals/:id/wait` (204 = no decision, normal flow). */
export const ApprovalWaitResponseSchema = z.object({
  behavior: z.enum(['allow', 'deny']),
  message: z.string().max(500).optional(),
});
export type ApprovalWaitResponse = z.infer<typeof ApprovalWaitResponseSchema>;
