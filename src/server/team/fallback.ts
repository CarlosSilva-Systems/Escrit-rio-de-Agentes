import type { TeamView } from '../../shared/contracts';
import { foldText } from './quadro';
import type { QuadroAgent } from './quadro';

// Reserve team derived from QUADRO.md when escritorio.json is missing/invalid and there is no
// previous valid one (CA-13). Every agent gets a provisional desk (desk null + provisional) in
// the Reception, and the department comes from the "Fase" column.

type View = TeamView;

const PHASE_TO_DEPARTMENT: Readonly<Record<string, string>> = {
  planejar: 'planejamento',
  construir: 'engenharia',
  qualidade: 'qualidade',
  entregar: 'entrega',
  apoio: 'biblioteca',
  todas: 'diretoria',
};

const DEPARTMENT_NAMES: Readonly<Record<string, string>> = {
  diretoria: 'Diretoria',
  planejamento: 'Planejamento',
  engenharia: 'Engenharia',
  qualidade: 'Qualidade e Segurança',
  entrega: 'Entrega',
  biblioteca: 'Biblioteca',
};

export const FALLBACK_FREELANCER: NonNullable<View['freelancer']> = {
  nickname: 'Freelancer',
  title: 'Colaborador visitante',
  sprite: 'npc-freelancer',
  badge: 'visitante',
  showAgentTypeAsLabel: true,
  phrases: [],
  homeRoom: 'REC',
};

function departmentOf(a: QuadroAgent): string {
  if (a.agentType === 'chefe') return 'diretoria';
  return PHASE_TO_DEPARTMENT[foldText(a.phase)] ?? 'biblioteca';
}

export function buildFallbackView(agents: readonly QuadroAgent[]): View {
  const list =
    agents.length > 0
      ? agents
      : [{ agentType: 'chefe', nickname: 'Chefe', phase: 'Todas', role: '' }];
  const departments = new Map<string, View['departments'][number]>();
  const viewAgents: View['agents'] = list.map((a) => {
    const department = departmentOf(a);
    if (!departments.has(department))
      departments.set(department, {
        id: department,
        name: DEPARTMENT_NAMES[department] ?? department,
      });
    const isLead = a.agentType === 'chefe';
    return {
      agentType: a.agentType,
      nickname: a.nickname.slice(0, 24),
      title: a.role.slice(0, 60) || a.agentType,
      department,
      desk: null,
      provisional: true,
      isLead,
      badge: isLead ? 'diretoria' : 'staff',
    };
  });
  return {
    source: 'quadro-fallback',
    studio: { name: 'Escritório', nameIsProvisional: true },
    departments: [...departments.values()],
    agents: viewAgents,
    freelancer: FALLBACK_FREELANCER,
  };
}
