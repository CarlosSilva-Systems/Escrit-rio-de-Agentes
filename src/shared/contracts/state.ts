import { z } from 'zod';
import {
  DiagnosticSchema,
  epochMs,
  PROTOCOL_VERSION,
  ProjectRefSchema,
  ToolCategorySchema,
} from './common';
import { OfficeEventKindSchema } from './events';
import {
  EscritorioAgentSchema,
  EscritorioDepartmentSchema,
  EscritorioFreelancerSchema,
  EscritorioMascotSchema,
} from './escritorio';

// Office state (ARQUITETURA §5.3). Read by the browser: TOLERANT (unknown fields ignored).
// Types the architecture names but does not detail (TeamView, UsageView, ActivityItem,
// PublicConfig, KanbanColumn, TimelineStep, PlanDiagnostic) are defined here.

export const KanbanColumnSchema = z.enum(['todo', 'doing', 'review', 'done', 'blocked']);
export type KanbanColumn = z.infer<typeof KanbanColumnSchema>;

export const TimelineStepSchema = z.enum([
  'planejado',
  'aprovado',
  'construcao',
  'qualidade',
  'docs',
  'pr-pronto',
]);
export type TimelineStep = z.infer<typeof TimelineStepSchema>;

export const PlanDiagnosticSchema = z.object({
  line: z.number().int().nonnegative(),
  message: z.string().max(300),
});
export type PlanDiagnostic = z.infer<typeof PlanDiagnosticSchema>;

export const NpcLogicalSchema = z.object({
  /** agentType (fixed) or "freelancer:<agentId>". */
  key: z.string().min(1).max(160),
  kind: z.enum(['fixed', 'freelancer']),
  agentType: z.string().min(1).max(100),
  displayName: z.string().min(1).max(60),
  status: z.enum(['idle', 'working', 'awaiting']),
  /** Parallel instances (CA-16). */
  activeCount: z.number().int().nonnegative(),
  /** Start of the current status, epoch ms. */
  since: epochMs,
  project: ProjectRefSchema.optional(),
  taskRef: z.string().max(16).optional(),
  taskTitle: z.string().max(120).optional(),
  tool: ToolCategorySchema.optional(),
  approvalIds: z.array(z.string()),
  lastEventAt: epochMs.optional(),
});
export type NpcLogical = z.infer<typeof NpcLogicalSchema>;

export const ApprovalCardSchema = z.object({
  id: z.string().min(1).max(64),
  createdAt: epochMs,
  deadline: epochMs,
  state: z.enum(['pending', 'allowed', 'denied', 'expired', 'answered']),
  sessionId: z.string().max(100),
  npcKey: z.string().max(160),
  project: ProjectRefSchema,
  toolName: z.string().max(200),
  /** At most 200 chars, secrets masked; details via GET /api/approvals/:id/details. */
  summary: z.string().max(200),
  kind: z.enum(['tool', 'plan']),
});
export type ApprovalCard = z.infer<typeof ApprovalCardSchema>;

export const PlanSummarySchema = z.object({
  size: z.enum(['P', 'M', 'G']).optional(),
  phase: TimelineStepSchema.optional(),
  /** 0-100, or null when there is nothing to count ("—", CA-50). */
  progress: z.number().min(0).max(100).nullable(),
  counts: z.record(KanbanColumnSchema, z.number().int().nonnegative()),
  diagnostics: z.array(PlanDiagnosticSchema),
});
export type PlanSummary = z.infer<typeof PlanSummarySchema>;

export const ProjectSummarySchema = z.object({
  name: z.string().min(1).max(100),
  active: z.boolean(),
  lastActivityAt: epochMs.optional(),
  roomSlot: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]).optional(),
  plan: PlanSummarySchema.optional(),
});
export type ProjectSummary = z.infer<typeof ProjectSummarySchema>;

/** Public view of the team: escritorio.json, or a minimal set derived from QUADRO.md. */
export const TeamViewSchema = z.object({
  source: z.enum(['escritorio', 'quadro-fallback']),
  studio: z.object({ name: z.string(), nameIsProvisional: z.boolean().optional() }),
  departments: z.array(EscritorioDepartmentSchema.partial({ rooms: true, colorToken: true })),
  agents: z.array(EscritorioAgentSchema.partial().required({ agentType: true, nickname: true })),
  freelancer: EscritorioFreelancerSchema.optional(),
  mascots: z.array(EscritorioMascotSchema).optional(),
});
export type TeamView = z.infer<typeof TeamViewSchema>;

const UsageWindowViewSchema = z.object({
  /** Raw value as read; the UI clamps to 0-100. */
  usedPercentage: z.number(),
  /** Epoch seconds. */
  resetsAt: z.number(),
  stale: z.boolean(),
  /** true when the raw value was outside 0-100 (CA-56). */
  suspect: z.boolean(),
});

export const UsageViewSchema = z.object({
  updatedAt: epochMs,
  /** Seconds since the last reading; the UI shows "updated X min ago" after 120 s (CA-61). */
  ageSec: z.number().nonnegative(),
  fiveHour: UsageWindowViewSchema.optional(),
  sevenDay: UsageWindowViewSchema.optional(),
  extraWindows: z.record(z.string(), UsageWindowViewSchema).optional(),
  spendLimit: z.record(z.string(), z.unknown()).nullable().optional(),
});
export type UsageView = z.infer<typeof UsageViewSchema>;

/** Metadata only: never prompts, replies or tool inputs. */
export const ActivityItemSchema = z.object({
  id: z.string().min(1).max(64),
  ts: epochMs,
  npcKey: z.string().max(160),
  kind: OfficeEventKindSchema,
  project: ProjectRefSchema,
  tool: ToolCategorySchema.optional(),
  taskRef: z.string().max(16).optional(),
  summary: z.string().max(200).optional(),
});
export type ActivityItem = z.infer<typeof ActivityItemSchema>;

/** Settings the browser may read/change: a closed list (CA-31). */
export const ChatModeSchema = z.enum(['interactive', 'automatic']);
export const PublicConfigSchema = z.object({
  lang: z.enum(['pt-BR', 'en']),
  sound: z.boolean(),
  music: z.boolean(),
  quality: z.enum(['auto', 'high', 'medium', 'low']),
  approvalDeadlineSec: z.number().int().min(10).max(300),
  chatMode: z.record(z.string(), ChatModeSchema),
  npcWorkPlace: z.enum(['desk', 'projectRoom', 'auto']),
});
export type PublicConfig = z.infer<typeof PublicConfigSchema>;

export const OfficeSnapshotSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  now: epochMs,
  team: TeamViewSchema,
  npcs: z.array(NpcLogicalSchema),
  approvals: z.array(ApprovalCardSchema),
  projects: z.array(ProjectSummarySchema),
  overflowProjects: z.array(z.string()),
  usage: UsageViewSchema.nullable(),
  /** Last 200 items. */
  activity: z.array(ActivityItemSchema).max(200),
  config: PublicConfigSchema,
  diagnostics: z.array(DiagnosticSchema),
});
export type OfficeSnapshot = z.infer<typeof OfficeSnapshotSchema>;
