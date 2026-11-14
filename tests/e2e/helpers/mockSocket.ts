import type { Page } from '@playwright/test';
import type { OfficeSnapshot } from '../../../src/shared/contracts';
import { makeSnapshot } from '../../../src/web/store/fixtures';

const AGENTS = [
  ['chefe', 'Henrique'],
  ['analista', 'Alice'],
  ['arquiteto', 'Artur'],
  ['designer-ux', 'Bianca'],
  ['dev-web', 'Lívia'],
  ['dev-backend', 'Bruno'],
  ['dev-odoo', 'Otávio'],
  ['dev-embarcados', 'Eduardo'],
  ['dev-automacao', 'Rafael'],
  ['testador-qa', 'Teresa'],
  ['revisor-codigo', 'Rita'],
  ['revisor-seguranca', 'Sérgio'],
  ['pentester', 'Pedro'],
  ['git-github', 'Gabriela'],
  ['documentador', 'Davi'],
  ['pesquisador', 'Paula'],
] as const;

/** A realistic snapshot: 16 agents, 3 of them working, 2 active projects. */
export function e2eSnapshot(): OfficeSnapshot {
  const base = makeSnapshot();
  return makeSnapshot({
    team: {
      source: 'escritorio',
      studio: { name: 'Estúdio Teste' },
      departments: [],
      agents: AGENTS.map(([agentType, nickname]) => ({ agentType, nickname })),
    },
    npcs: AGENTS.map(([agentType, nickname], i) => ({
      key: agentType,
      kind: 'fixed' as const,
      agentType,
      displayName: nickname,
      status:
        i === 4 || i === 5
          ? ('working' as const)
          : i === 9
            ? ('awaiting' as const)
            : ('idle' as const),
      activeCount: i === 4 || i === 5 || i === 9 ? 1 : 0,
      since: base.now,
      approvalIds: [],
    })),
    projects: [
      { name: 'Sites', active: true },
      { name: 'Odoo', active: true },
      { name: 'Antigo', active: false },
    ],
  });
}

/** Mocks `/ws`: sends hello + snapshot on connect, in one batch like the real server. */
export async function mockSocket(
  page: Page,
  snapshot: OfficeSnapshot = e2eSnapshot(),
): Promise<void> {
  await page.routeWebSocket(/\/ws$/, (ws) => {
    ws.send(
      JSON.stringify({
        t: 'batch',
        items: [
          { t: 'hello', v: 1, serverVersion: '0.0.0-test', now: snapshot.now },
          { t: 'snapshot', snapshot },
        ],
      }),
    );
  });
}
