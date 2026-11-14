import { z } from 'zod';

// `~/.claude/equipe/uso.json` (schema `uso/v1`, ADR-0006). Written by our statusLine script,
// read by the server. TOLERANT: unknown fields are ignored. Out-of-range percentages are NOT
// rejected here: the UI clamps them to 0-100 and flags "suspect data" (CA-56).

export const UsoWindowSchema = z.object({
  usedPercentage: z.number().finite(),
  /** Epoch seconds, as sent by Claude Code in `rate_limits.*.resets_at`. */
  resetsAt: z.number().finite(),
  observedAt: z.iso.datetime().optional(),
  /** true when the window reset moment passed and no newer reading arrived (CA-57). */
  stale: z.boolean().optional(),
});
export type UsoWindow = z.infer<typeof UsoWindowSchema>;

export const UsoSchema = z.object({
  schema: z.literal('uso/v1'),
  updatedAt: z.iso.datetime(),
  source: z.string().max(40).optional(),
  sessionId: z.string().max(100).optional(),
  model: z.string().max(100).optional(),
  windows: z.object({
    fiveHour: UsoWindowSchema.optional(),
    sevenDay: UsoWindowSchema.optional(),
  }),
  /** Pass-through if Claude Code ever sends it (CA-62); hidden in the UI when null/absent. */
  spendLimit: z.record(z.string(), z.unknown()).nullable().optional(),
  extraWindows: z.record(z.string(), UsoWindowSchema).optional(),
});
export type Uso = z.infer<typeof UsoSchema>;
