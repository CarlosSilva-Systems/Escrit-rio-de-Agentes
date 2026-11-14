import { z } from 'zod';

// `~/.claude/equipe/escritorio.json` (schema `escritorio/v1`, ADR-0008). Mirrors
// docs/projeto/2026-11-12-escritorio-equipe/escritorio.schema.json. Cross-file rules (desk
// exists in mapa.json, desk belongs to a room of the agent's department, QUADRO.md) belong to
// the TeamRegistry (T-20); the single-file rules are enforced here.

export const slug = z
  .string()
  .max(48)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);

/** Room/desk id as defined in MAPA.md and mapa.json (e.g. QUA, QUA-01, FL-D1). */
export const mapId = z
  .string()
  .max(16)
  .regex(/^[A-Z][A-Z0-9]*(-[A-Z0-9]+)*$/);

const phrases = z.array(z.string().min(1).max(120)).max(50);

export const ROUTINE_ACTIVITIES = [
  'coffee',
  'copa-chat',
  'water',
  'window',
  'terrace',
  'arcade',
  'pingpong',
  'bathroom',
  'library',
  'sofa',
] as const;

export const EscritorioAgentSchema = z.strictObject({
  /** = frontmatter name of ~/.claude/agents/<name>.md = hook agent_type. Unique. */
  agentType: slug,
  nickname: z.string().min(1).max(24),
  fullName: z.string().min(3).max(60),
  title: z.string().min(2).max(60),
  department: slug,
  /** Desk id from mapa.json (e.g. PLN-02). null = provisional desk (FL-D1/FL-D2). */
  desk: mapId.nullable(),
  provisional: z.boolean().default(false),
  sprite: slug,
  badge: z.enum(['staff', 'diretoria']).default('staff'),
  /** true only for the main-thread agent (chefe). */
  isLead: z.boolean().default(false),
  since: z.iso.date().optional(),
  personality: z.strictObject({
    traits: z.array(z.string().max(30)).min(1).max(6),
    tone: z.string().max(160),
    routineWeights: z
      .partialRecord(z.enum(ROUTINE_ACTIVITIES), z.number().min(0).max(5))
      .optional(),
  }),
  phrases,
});
export type EscritorioAgent = z.infer<typeof EscritorioAgentSchema>;

export const EscritorioDepartmentSchema = z.strictObject({
  id: slug,
  name: z.string().min(1).max(40),
  /** Design token defined in docs/design/GUIA-VISUAL.md. */
  colorToken: z.string().regex(/^dept-[a-z0-9-]+$/),
  /** Room ids from mapa.json (e.g. QUA, SOC). */
  rooms: z.array(mapId).min(1),
});

export const EscritorioFreelancerSchema = z.strictObject({
  nickname: z.string().min(1).max(24),
  title: z.string().min(1).max(60),
  sprite: slug,
  badge: z.literal('visitante'),
  showAgentTypeAsLabel: z.boolean().default(true),
  phrases,
  /** Room where freelancers arrive and wait (REC). */
  homeRoom: mapId,
});

export const EscritorioMascotSchema = z.strictObject({
  id: slug,
  name: z.string().min(1).max(24),
  species: z.enum(['pomeranian', 'golden-retriever']),
  description: z.string().max(120).optional(),
  sprite: slug,
});

const EscritorioObjectSchema = z.strictObject({
  schema: z.literal('escritorio/v1'),
  updatedAt: z.iso.datetime().optional(),
  studio: z.strictObject({
    name: z.string().min(1).max(40),
    nameIsProvisional: z.boolean().default(false),
  }),
  departments: z.array(EscritorioDepartmentSchema).min(1),
  agents: z.array(EscritorioAgentSchema).min(1),
  freelancer: EscritorioFreelancerSchema,
  mascots: z.array(EscritorioMascotSchema).max(4).optional(),
});

function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const v of values) (seen.has(v) ? dup : seen).add(v);
  return [...dup];
}

export const EscritorioSchema = EscritorioObjectSchema.superRefine((cfg, ctx) => {
  const issue = (path: (string | number)[], message: string) =>
    ctx.addIssue({ code: 'custom', path, message });

  for (const d of duplicates(cfg.agents.map((a) => a.agentType)))
    issue(['agents'], `duplicate agentType "${d}"`);
  for (const d of duplicates(cfg.departments.map((x) => x.id)))
    issue(['departments'], `duplicate department id "${d}"`);

  const departmentIds = new Set(cfg.departments.map((d) => d.id));
  cfg.agents.forEach((a, i) => {
    if (!departmentIds.has(a.department))
      issue(['agents', i, 'department'], `unknown department "${a.department}"`);
  });

  for (const d of duplicates(cfg.agents.flatMap((a) => (a.desk ? [a.desk] : []))))
    issue(['agents'], `desk "${d}" assigned to more than one agent`);

  const leads = cfg.agents.filter((a) => a.isLead).length;
  if (leads !== 1) issue(['agents'], `exactly one agent must have isLead=true (found ${leads})`);
});
export type Escritorio = z.infer<typeof EscritorioSchema>;
