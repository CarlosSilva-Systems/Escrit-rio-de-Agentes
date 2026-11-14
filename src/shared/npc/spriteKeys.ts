// Which sprite sheet an agent uses. The team config names one (`sprite`); the QUADRO.md reserve
// team does not, so the technical agent name maps to the sheets of PERSONAGENS.md. Agents with no
// art yet (new hires) get one of the three neutral Freelancer sheets, stable per key.

export const AGENT_TYPE_SPRITE: Readonly<Record<string, string>> = {
  chefe: 'npc-chefe',
  analista: 'npc-alice',
  arquiteto: 'npc-artur',
  'designer-ux': 'npc-bianca',
  'dev-web': 'npc-livia',
  'dev-backend': 'npc-bruno',
  'dev-odoo': 'npc-otavio',
  'dev-embarcados': 'npc-eduardo',
  'dev-automacao': 'npc-rafael',
  'testador-qa': 'npc-teresa',
  'revisor-codigo': 'npc-rita',
  'revisor-seguranca': 'npc-sergio',
  pentester: 'npc-pedro',
  'git-github': 'npc-gabriela',
  documentador: 'npc-davi',
  pesquisador: 'npc-paula',
};

const FREELANCER_SHEETS = ['npc-freelancer', 'npc-freelancer-2', 'npc-freelancer-3'] as const;

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** One of the 3 visitor looks, stable for a given key (the sorted variation of PERSONAGENS.md §3). */
export function freelancerSprite(key: string): string {
  return FREELANCER_SHEETS[hash(key) % FREELANCER_SHEETS.length] as string;
}

/**
 * Sprite sheet for an agent: the configured one if the art exists, else the known mapping,
 * else a visitor look. `hasSheet` tells whether the atlas can draw a sheet.
 */
export function spriteKeyFor(
  agent: { agentType: string; sprite?: string | undefined },
  hasSheet: (key: string) => boolean,
): string {
  if (agent.sprite && hasSheet(agent.sprite)) return agent.sprite;
  const mapped = AGENT_TYPE_SPRITE[agent.agentType];
  if (mapped && hasSheet(mapped)) return mapped;
  return freelancerSprite(agent.agentType);
}
