import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { buildWeb } from './helpers/appServer';
import { startRealOffice, type RealOffice } from './helpers/realServer';

// Real server end to end: hook POST -> OfficeState -> WebSocket -> NPC state machine -> canvas/HUD.

let office: RealOffice;

test.beforeAll(async () => {
  const dist = join(process.cwd(), 'test-results', 'web-dist-npcs');
  await buildWeb(dist);
  office = await startRealOffice(dist);
});

test.afterAll(async () => {
  await office.stop();
});

type NpcRow = { key: string; mode: string; anim: string; tile: [number, number] };
type Dbg = Window & {
  __officeDebug?: {
    npcs: () => NpcRow[];
    metrics: () => { scale: number; dpr: number; rendered: number };
    engine: {
      debugSprites: () => { id: string; x: number; y: number }[];
      tileToCss: (x: number, y: number) => { x: number; y: number } | null;
    };
  };
};

const SESSION = '3f1c2f9e-8a7b-4c1d-9b6e-2a5d7c8e9f10';
const start = (type: string, id: string) => ({
  hook_event_name: 'SubagentStart',
  session_id: SESSION,
  cwd: 'C:\\dev\\Sites',
  agent_id: id,
  agent_type: type,
});
const stop = (type: string, id: string) => ({
  ...start(type, id),
  hook_event_name: 'SubagentStop',
});

async function open(page: Page, query = '?debug'): Promise<void> {
  await office.signIn(page.context());
  await page.goto(`${office.origin}/${query}`);
  await page.waitForFunction(
    () => ((window as Dbg).__officeDebug?.npcs().length ?? 0) >= 16,
    undefined,
    {
      timeout: 20_000,
    },
  );
}

const npcs = (page: Page) => page.evaluate(() => (window as Dbg).__officeDebug!.npcs());
const row = async (page: Page, key: string) => (await npcs(page)).find((r) => r.key === key);

const freelancer = async (page: Page) =>
  (await npcs(page)).find((r) => r.key.startsWith('freelancer:'));

/** Waits for a state and returns how many ms it took (from now). */
async function waitForRow(
  page: Page,
  key: string,
  mode: string,
  timeoutMs: number,
): Promise<number> {
  const t0 = Date.now();
  await expect
    .poll(async () => (await row(page, key))?.mode, { timeout: timeoutMs, intervals: [25] })
    .toBe(mode);
  return Date.now() - t0;
}

test('CA-15: all 16 agents are in the office at their desks from the team alone (reserve team, no escritorio.json)', async ({
  page,
}) => {
  await open(page);
  const rows = await npcs(page);
  expect(rows).toHaveLength(16);
  expect(rows.every((r) => r.mode === 'atDesk')).toBe(true);
  expect(new Set(rows.map((r) => r.tile.join(','))).size).toBe(16);
  await expect(page.getByText('Agentes 0/16')).toBeVisible();
});

test('CA-15: a SubagentStart hook makes the right NPC (dev-web) start working in under 1 s, and Stop makes her celebrate', async ({
  page,
}) => {
  await open(page);
  const before = await row(page, 'dev-backend');
  const posted = Date.now();
  expect(await office.hook(start('dev-web', 'agent-e2e-1'))).toBe(204);
  await waitForRow(page, 'dev-web', 'working', 1000);
  const latency = Date.now() - posted;
  expect(latency).toBeLessThan(1000);
  expect((await row(page, 'dev-web'))?.anim).toMatch(/type|read/);
  expect((await row(page, 'dev-backend'))?.mode).toBe(before?.mode); // others untouched
  await expect(page.getByText('Agentes 1/16')).toBeVisible();

  await office.hook(stop('dev-web', 'agent-e2e-1'));
  await waitForRow(page, 'dev-web', 'celebrating', 1000);
  await expect
    .poll(async () => (await row(page, 'dev-web'))?.mode, { timeout: 4000 })
    .toBe('atDesk');
});

test('CA-17: an unknown agent_type makes a Freelancer walk in through the Reception, and out when done', async ({
  page,
}) => {
  await open(page);
  await office.hook(start('agente-desconhecido', 'agent-f1'));
  await expect.poll(async () => (await freelancer(page))?.mode, { timeout: 1500 }).toBe('arriving');
  await expect
    .poll(async () => (await freelancer(page))?.mode, { timeout: 40_000 })
    .toBe('working');
  expect((await npcs(page)).length).toBe(17);
  await office.hook(stop('agente-desconhecido', 'agent-f1'));
  await expect.poll(async () => (await freelancer(page))?.mode, { timeout: 2000 }).toBe('leaving');
  await expect
    .poll(async () => (await freelancer(page)) === undefined, { timeout: 40_000 })
    .toBe(true);
});

test('CA-71: a permission request sends the NPC to the Director door queue with the "!"', async ({
  page,
}) => {
  await open(page);
  const hook = await import('node:fs').then((fs) =>
    JSON.parse(
      fs.readFileSync(
        join(process.cwd(), 'tests', 'fixtures', 'hooks', 'permission-request.json'),
        'utf8',
      ),
    ),
  );
  expect(await office.hook(hook)).toBe(204);
  await expect
    .poll(async () => (await row(page, 'chefe'))?.mode, { timeout: 2000 })
    .toMatch(/goingToQueue|awaiting/);
  await expect
    .poll(async () => (await row(page, 'chefe'))?.mode, { timeout: 40_000 })
    .toBe('awaiting');
  await expect(page.getByText('Agentes 1/16')).toBeVisible();
});

async function npcScreenPoint(page: Page, key: string) {
  return page.evaluate((k) => {
    const dbg = (window as Dbg).__officeDebug!;
    const s = dbg.engine.debugSprites().find((n) => n.id === k)!;
    const m = dbg.metrics();
    const p = dbg.engine.tileToCss(s.x / 16, s.y / 16)!;
    const css = m.scale / m.dpr;
    const box = document
      .querySelector<HTMLCanvasElement>('[data-testid="office-canvas"]')!
      .getBoundingClientRect();
    return { x: box.left + p.x + 8 * css, y: box.top + p.y - 6 * css };
  }, key);
}

test('CA-14: hovering an NPC shows the card in under 150 ms with name, title, department and status; leaving hides it', async ({
  page,
}) => {
  await open(page, '?debug&zoom=3');
  // Bring Bruno (dev-backend) into view: centre the camera on his tile through the engine hook.
  await page.evaluate(() => {
    const dbg = (window as Dbg).__officeDebug!;
    const s = dbg.engine.debugSprites().find((n) => n.id === 'dev-backend')!;
    (dbg.engine as unknown as { centerOnTile: (x: number, y: number) => void }).centerOnTile(
      Math.round(s.x / 16),
      Math.round(s.y / 16),
    );
  });
  await page.waitForTimeout(300);
  const point = await npcScreenPoint(page, 'dev-backend');
  const t0 = Date.now();
  await page.mouse.move(point.x - 40, point.y - 40);
  await page.mouse.move(point.x, point.y);
  const card = page.getByTestId('npc-card');
  await expect(card).toBeVisible({ timeout: 150 });
  expect(Date.now() - t0).toBeLessThan(400); // generous wall-clock bound including Playwright overhead
  await expect(card).toContainText('Bruno');
  await expect(card).toContainText('Parado');
  await expect(card).toContainText('Engenharia');
  await page.mouse.move(point.x + 300, point.y + 200);
  await expect(card).toHaveCount(0);
});

test('CA-14: the hover card follows the status: working shows task/project and an icon with text', async ({
  page,
}) => {
  await open(page, '?debug&zoom=3');
  await office.hook(start('dev-odoo', 'agent-e2e-3'));
  await waitForRow(page, 'dev-odoo', 'working', 1500);
  await page.getByRole('button', { name: 'Equipe' }).click();
  const rowButton = page.locator('[data-npc="dev-odoo"]');
  await rowButton.focus();
  const card = page.getByTestId('npc-card');
  await expect(card).toBeVisible();
  await expect(card).toContainText('Otávio');
  await expect(card).toContainText('Trabalhando');
  await expect(card).toContainText('Sites');
});

test('CA-14: the team list reaches every NPC by keyboard; Enter opens the panel with history, tasks and tokens "—"; Follow works and Esc stops it', async ({
  page,
}) => {
  await open(page, '?debug&zoom=2');
  await office.hook(start('dev-web', 'agent-e2e-4'));
  await waitForRow(page, 'dev-web', 'working', 1500);
  await page.getByRole('button', { name: 'Equipe' }).click();
  await expect(page.locator('.team-row')).toHaveCount(16);
  await page.locator('[data-npc="dev-web"]').focus();
  await page.keyboard.press('Enter');
  const panel = page.getByTestId('npc-panel');
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('heading', { name: 'Lívia' })).toBeVisible();
  await expect(panel.getByText('— (indisponível por enquanto)')).toBeVisible();
  await expect(panel.getByTestId('npc-history')).toBeVisible();
  expect(await panel.getByTestId('npc-history').locator('li').count()).toBeGreaterThanOrEqual(1);
  await panel.getByRole('button', { name: 'Seguir' }).click();
  await expect(page.getByTestId('following')).toContainText('Seguindo: Lívia');
  await page.keyboard.press('Escape'); // closes the panel first...
  await expect(panel).toHaveCount(0);
  // Esc closes the innermost thing each time: hover card, team drawer, then stops following.
  for (let i = 0; i < 6 && (await page.getByTestId('following').count()) > 0; i++)
    await page.keyboard.press('Escape');
  await expect(page.getByTestId('following')).toHaveCount(0);
});

test('CA-80: the minimap shows the floor, centres the camera on click, and M enlarges it', async ({
  page,
}) => {
  await open(page, '?debug&zoom=4');
  const mini = page.getByTestId('minimap').locator('canvas');
  await expect(mini).toBeVisible();
  const before = await page.evaluate(() => (window as Dbg).__officeDebug!.engine.tileToCss(0, 0));
  const box = (await mini.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.9, box.y + box.height * 0.85); // bottom-right of the floor
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => (window as Dbg).__officeDebug!.engine.tileToCss(0, 0));
  expect(after!.x).toBeLessThan(before!.x - 100);
  expect(after!.y).toBeLessThan(before!.y - 100);
  await page.keyboard.press('m');
  await expect(page.locator('[data-panel="map"]')).toBeVisible();
  expect((await mini.boundingBox())!.width).toBeGreaterThan(300);
});

test('CA-21: a new agent in the team plays the welcome scene (Reception -> desk) and is announced; removing one says goodbye', async ({
  page,
}) => {
  test.setTimeout(150_000);
  await open(page);
  // Insert a row into the "Equipe ativa" table: rewrite the file with an extra line after Paula's row.
  const fs = await import('node:fs');
  const path = join(office.claudeHome, 'equipe', 'QUADRO.md');
  const text = fs.readFileSync(path, 'utf8');
  fs.writeFileSync(
    path,
    text.replace(
      '| pesquisador | Paula |',
      '| dev-novo | Nina | Construir | Novo dev | sonnet | implementa |\n| pesquisador | Paula |',
    ),
  );
  await expect
    .poll(async () => (await row(page, 'dev-novo'))?.mode, { timeout: 10_000 })
    .toBe('arriving');
  await expect(page.getByTestId('notice')).toContainText('Novo na equipe: Nina');
  await expect
    .poll(async () => (await row(page, 'dev-novo'))?.mode, { timeout: 60_000 })
    .toBe('atDesk');
  // Farewell
  fs.writeFileSync(path, fs.readFileSync(path, 'utf8').replace(/\| dev-novo \| Nina[^\n]*\n/, ''));
  await expect
    .poll(async () => (await row(page, 'dev-novo'))?.mode, { timeout: 10_000 })
    .toBe('leaving');
  await expect(page.getByTestId('notice')).toContainText('Nina saiu da equipe');
});

test('CA-22: with reduced motion the NPC jumps to its destination instead of walking', async ({
  browser,
}) => {
  const context = await browser.newContext({
    reducedMotion: 'reduce',
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();
  try {
    await open(page);
    const hook = await import('node:fs').then((fs) =>
      JSON.parse(
        fs.readFileSync(
          join(process.cwd(), 'tests', 'fixtures', 'hooks', 'permission-request.json'),
          'utf8',
        ),
      ),
    );
    await office.hook(hook);
    await expect
      .poll(async () => (await row(page, 'chefe'))?.mode, { timeout: 2000 })
      .toBe('awaiting');
    expect((await row(page, 'chefe'))?.tile).toEqual([9, 12]);
  } finally {
    await context.close();
  }
});

test('CA-82: with the real server (CSP on) the fonts load without violations; font files need a session', async ({
  page,
  playwright,
}) => {
  const violations: string[] = [];
  page.on('console', (m) => {
    if (/content security policy|refused to/i.test(m.text())) violations.push(m.text());
  });
  await open(page);
  await page.evaluate(async () => {
    await Promise.all([
      document.fonts.load('16px "Pixelify Sans"'),
      document.fonts.load('16px "Silkscreen"'),
    ]);
  });
  const loaded = await page.evaluate(() =>
    [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/"/g, '')),
  );
  expect(loaded).toEqual(expect.arrayContaining(['Pixelify Sans', 'Silkscreen']));
  expect(violations).toEqual([]);

  const url = `${office.origin}/assets/fonts/PixelifySans-Variable.ttf`;
  const withSession = await page.context().request.get(url);
  expect(withSession.status()).toBe(200);
  expect((await withSession.body()).length).toBe(79160);
  const anonymous = await playwright.request.newContext();
  expect((await anonymous.get(url)).status()).toBe(401);
  await anonymous.dispose();
});
