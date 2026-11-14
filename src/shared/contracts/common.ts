import { z } from 'zod';

/** Protocol version carried by every message/event (`v: 1`). */
export const PROTOCOL_VERSION = 1 as const;

/** Epoch milliseconds. */
export const epochMs = z.number().int().nonnegative();

export const ProjectRefSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('dev'), name: z.string().min(1).max(100) }),
  z.object({ kind: z.literal('outside'), basename: z.string().min(1).max(100) }),
  z.object({ kind: z.literal('unknown') }),
]);
export type ProjectRef = z.infer<typeof ProjectRefSchema>;

export const ToolCategorySchema = z.enum([
  'edit',
  'read',
  'bash',
  'web',
  'delegate',
  'task',
  'plan',
  'other',
]);
export type ToolCategory = z.infer<typeof ToolCategorySchema>;

/** Diagnostic shown in the UI (ADR-0008: `{file, path, message}`). Never contains file contents. */
export const DiagnosticSchema = z.object({
  file: z.string().max(200),
  path: z.string().max(200).optional(),
  message: z.string().max(300),
  severity: z.enum(['info', 'warning', 'error']).default('warning'),
  /** Stable machine code (e.g. `team.file-missing`) the UI maps to an i18n message. */
  code: z.string().max(64).optional(),
  /** Short plain values for the i18n template (ids, field names, positions; never file content). */
  params: z.record(z.string().max(40), z.string().max(100)).optional(),
});
export type Diagnostic = z.infer<typeof DiagnosticSchema>;

/** Error body returned by every REST route. Never carries a stack trace. */
export const ErrorResponseSchema = z.object({
  error: z.object({ code: z.string().max(64), message: z.string().max(300) }),
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
