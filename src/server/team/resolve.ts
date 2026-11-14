import type { TeamView } from '../../shared/contracts';

// Resolves a hook `agent_type` to a fixed NPC or a temporary "Freelancer" (CA-17, ARQUITETURA §6.1).
// Pure.

export type TeamAgent = TeamView['agents'][number];

export type ResolvedAgent =
  | { kind: 'fixed'; key: string; agentType: string; agent: TeamAgent }
  | { kind: 'freelancer'; key: string; agentType: string };

export interface AgentIdentity {
  /** null/undefined/empty = main thread, which maps to the lead ("chefe"). */
  agentType?: string | null;
  agentId?: string | null;
}

const LEAD_FALLBACK = 'chefe';

export function resolveAgent(view: TeamView, ident: AgentIdentity): ResolvedAgent {
  const type = (ident.agentType ?? '').trim();
  if (type === '') {
    const lead =
      view.agents.find((a) => a.isLead) ?? view.agents.find((a) => a.agentType === LEAD_FALLBACK);
    if (lead) return { kind: 'fixed', key: lead.agentType, agentType: lead.agentType, agent: lead };
    return {
      kind: 'freelancer',
      key: `freelancer:${ident.agentId ?? LEAD_FALLBACK}`,
      agentType: LEAD_FALLBACK,
    };
  }
  const agent =
    view.agents.find((a) => a.agentType === type) ??
    view.agents.find((a) => a.agentType === type.toLowerCase());
  if (agent) return { kind: 'fixed', key: agent.agentType, agentType: agent.agentType, agent };
  return { kind: 'freelancer', key: `freelancer:${ident.agentId ?? type}`, agentType: type };
}

/** Active freelancers whose type became a real NPC after a team change (CA-17: replaced live). */
export function findPromotedFreelancers<T extends { agentType: string }>(
  next: TeamView,
  activeFreelancers: readonly T[],
): T[] {
  const known = new Set(next.agents.map((a) => a.agentType));
  return activeFreelancers.filter((f) => known.has(f.agentType));
}
