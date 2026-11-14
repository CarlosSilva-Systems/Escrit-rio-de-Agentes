import { z } from 'zod';
import { epochMs, PROTOCOL_VERSION, ProjectRefSchema, ToolCategorySchema } from './common';
import type { ToolCategory } from './common';

export const OfficeEventKindSchema = z.enum([
  'session.start',
  'session.end',
  'prompt.submit',
  'turn.stop',
  'tool.pre',
  'tool.post',
  'tool.fail',
  'subagent.start',
  'subagent.stop',
  'permission.request',
  'notification',
  'task.created',
  'task.completed',
]);
export type OfficeEventKind = z.infer<typeof OfficeEventKindSchema>;

/** Normalized event (internal bus and activity feed). ARQUITETURA §5.2. */
export const OfficeEventSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  id: z.string().min(1).max(64),
  ts: epochMs,
  source: z.enum(['hook', 'jsonl', 'panel', 'system']),
  kind: OfficeEventKindSchema,
  sessionId: z.string().max(100).nullable(),
  project: ProjectRefSchema,
  agent: z.object({
    /** null = main thread, which maps to "chefe". */
    agentType: z.string().max(100).nullable(),
    agentId: z.string().max(100).nullable(),
  }),
  tool: z
    .object({
      name: z.string().min(1).max(200),
      category: ToolCategorySchema,
      useId: z.string().max(100).optional(),
    })
    .optional(),
  notificationType: z.string().max(100).optional(),
  task: z
    .object({
      /** "T-12" when it matches a plan task id. */
      ref: z.string().max(16).optional(),
      /** At most 120 chars, secrets masked. */
      subject: z.string().max(120).optional(),
    })
    .optional(),
});
export type OfficeEvent = z.infer<typeof OfficeEventSchema>;

const TOOL_CATEGORY_BY_NAME: Readonly<Record<string, ToolCategory>> = {
  Edit: 'edit',
  Write: 'edit',
  MultiEdit: 'edit',
  NotebookEdit: 'edit',
  Read: 'read',
  Grep: 'read',
  Glob: 'read',
  LS: 'read',
  Bash: 'bash',
  PowerShell: 'bash',
  WebFetch: 'web',
  WebSearch: 'web',
  Agent: 'delegate',
  Task: 'delegate',
  TaskCreate: 'task',
  TaskUpdate: 'task',
  TaskList: 'task',
  TaskGet: 'task',
  TodoWrite: 'task',
  ExitPlanMode: 'plan',
  EnterPlanMode: 'plan',
};

/** Tool name to category (ARQUITETURA §5.2). Unknown tools, including `mcp__*`, are `other`. */
export function categorizeTool(toolName: string | null | undefined): ToolCategory {
  if (!toolName) return 'other';
  return Object.hasOwn(TOOL_CATEGORY_BY_NAME, toolName)
    ? (TOOL_CATEGORY_BY_NAME[toolName] ?? 'other')
    : 'other';
}
