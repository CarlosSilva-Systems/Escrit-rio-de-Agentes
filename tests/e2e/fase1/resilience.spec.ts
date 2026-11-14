import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { resolveHomePaths, rotateTokenFiles } from '../../../src/server/home';
import { buildWeb } from '../helpers/appServer';
import {
  FIXED_TYPES,
  OPTIONAL_ASSETS,
  SESSION_ID,
  openReal,
  npcRows,
  startHook,
  startRestartableOffice,
  stopHook,
  watchConsole,
  type Dbg,
  type RestartableOffice,
} from './helpers';

// T-33 adversarial QA: connection resilience, expired sessions, rotated tokens, several tabs.

let office: RestartableOffice;

test.beforeAll(async () => {
  const dist = join(process.cwd(), 'test-results', 'web-dist-fase1-resilience');
  await buildWeb(dist);
  office = await startRestartableOffice(dist);
});

test.afterAll(async () => {
  await office.cleanup();
});

/** Counts WebSockets created / currently open in the page (client-side listener-leak probe). */
async function countSockets(page: Page) {
  await page.addInitScript(() => {
    const Native = window.WebSocket;
    const stats = { created: 0, open: 0 };
    let closed = 0;
    (window as unknown as { __wsStats: typeof stats }).__wsStats = stats;
    class Counted extends Native {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        stats.created++;
        stats.open++;
        this.addEventListener('close', () => {
          closed++;
          stats.open = stats.created - closed;
        });
      }
    }
    window.WebSocket = Counted as unknown as typeof WebSocket;
  });
}
const socketStats = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __wsStats: { created: number; open: number } }).__wsStats,
  );

test('CA-12: killing and restarting the server 4 times: banner shows, the page recovers on its own, and no socket / hub client leaks', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const log = watchConsole(page);
  await countSockets(page);
  await openReal(office, page);
  expect(office.clients()).toBe(1);

  for (let cycle = 0; cycle < 4; cycle++) {
    await office.stop();
    await expect(page.getByText(/Sem conexão com o servidor/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'Tentar agora' })).toBeVisible();
    await page.waitForTimeout(1500);
    await office.start();
    await expect(page.getByText(/Sem conexão com o servidor/)).toHaveCount(0, { timeout: 40_000 });
    await expect.poll(() => office.clients(), { timeout: 10_000 }).toBe(1);
  }

  // After 4 outages the page still holds exactly ONE open socket and the office still works.
  const stats = await socketStats(page);
  expect(stats.open).toBe(1);
  expect(stats.created).toBeGreaterThanOrEqual(5);
  expect(await office.hook(startHook('dev-web', 'agent-resil-1'))).toBe(204);
  await expect
    .poll(async () => (await npcRows(page)).find((r) => r.key === 'dev-web')?.mode, {
      timeout: 3000,
    })
    .toBe('working');
  await office.hook(stopHook('dev-web', 'agent-resil-1'));

  // Network errors from failed reconnects are expected; anything else is not.
  const unexpected = log.errors.filter((e) => !/WebSocket|ERR_CONNECTION_REFUSED|net::/i.test(e));
  expect(unexpected).toEqual([]);
});

test('CA-12: "Tentar agora" reconnects immediately when the server is back, without waiting for the backoff', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openReal(office, page);
  await office.stop();
  await expect(page.getByText(/Sem conexão com o servidor/)).toBeVisible({ timeout: 10_000 });
  // Let the backoff grow past 4 s so waiting would be slow, then bring the server back and click.
  await page.waitForTimeout(6000);
  await office.start();
  const t0 = Date.now();
  await page.getByRole('button', { name: 'Tentar agora' }).click();
  await expect(page.getByText(/Sem conexão com o servidor/)).toHaveCount(0, { timeout: 8000 });
  expect(Date.now() - t0).toBeLessThan(6000);
});

test('CA-03: token rotation while the page is open ends in the "open from the shortcut" screen, with no office and no reconnect loop', async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const context = await browser.newContext();
  const page = await context.newPage();
  await openReal(office, page);
  await rotateTokenFiles(resolveHomePaths(office.home));
  // The server notices on the next HTTP request (<= 1 s), closes the sockets with 4401; the page
  // re-checks the session, gets 401 and must stop retrying.
  await page.waitForTimeout(1200); // the server re-reads the token files at most once per second
  await office.get('/api/health').catch(() => undefined);
  await expect(page.getByRole('heading', { name: 'Abra o escritório pelo atalho' })).toBeVisible({
    timeout: 40_000,
  });
  await expect(page.getByTestId('office-canvas')).toHaveCount(0);
  await expect.poll(() => office.clients(), { timeout: 5000 }).toBe(0);
  // No reconnect loop: still no client after a few seconds.
  await page.waitForTimeout(4000);
  expect(office.clients()).toBe(0);
  await context.close();
  // The cookie of the shared helper is now dead: restart with fresh tokens for the next tests.
  await office.cleanup();
  const dist = join(process.cwd(), 'test-results', 'web-dist-fase1-resilience');
  office = await startRestartableOffice(dist);
});

test('CA-03: an expired / forged cookie gets the "open from the shortcut" screen and the WebSocket is never established', async ({
  browser,
}) => {
  const context = await browser.newContext();
  await context.addCookies([{ name: 'esc_sid', value: 'A'.repeat(43), url: office.origin }]);
  const page = await context.newPage();
  const sockets: string[] = [];
  page.on('websocket', (ws) => sockets.push(ws.url()));
  await page.goto(`${office.origin}/?debug`);
  // The server answers the page itself with the 401 page (no data, no app): that is the expected gate.
  await expect(page.getByTestId('office-canvas')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('Agentes 0/16');
  expect(sockets).toEqual([]);
  await context.close();
});

test('CA-03: a second tab opened after the first keeps both in sync; closing one leaves exactly the others connected', async ({
  browser,
}) => {
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext(),
    browser.newContext(),
  ]);
  const pages = [];
  for (const c of contexts) {
    const p = await c.newPage();
    await openReal(office, p);
    pages.push(p);
  }
  expect(office.clients()).toBe(3);
  expect(await office.hook(startHook('dev-odoo', 'agent-tabs-1'))).toBe(204);
  for (const p of pages) {
    await expect
      .poll(async () => (await npcRows(p)).find((r) => r.key === 'dev-odoo')?.mode, {
        timeout: 3000,
      })
      .toBe('working');
    await expect(p.getByText('Agentes 1/16')).toBeVisible();
  }
  await contexts[0]!.close();
  await expect.poll(() => office.clients(), { timeout: 5000 }).toBe(2);
  await office.hook(stopHook('dev-odoo', 'agent-tabs-1'));
  for (const p of pages.slice(1)) {
    await expect
      .poll(async () => (await npcRows(p)).find((r) => r.key === 'dev-odoo')?.mode, {
        timeout: 5000,
      })
      .not.toBe('working');
  }
  await contexts[1]!.close();
  await contexts[2]!.close();
});

test('CA-15: 16 NPCs working at the same time and a Freelancer coming and going 8 times: no console errors, <= 30 fps, state returns to idle', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const log = watchConsole(page);
  await openReal(office, page, '?debug&zoom=2');
  FIXED_TYPES.forEach((type) => void office.hook(startHook(type, `agent-all-${type}`)));
  await expect(page.getByText('Agentes 16/16')).toBeVisible({ timeout: 5000 });
  for (let i = 0; i < 8; i++) {
    await office.hook(startHook('agente-visitante', `agent-fl-${i}`));
    await expect
      .poll(async () => (await npcRows(page)).some((r) => r.key.startsWith('freelancer:')), {
        timeout: 3000,
      })
      .toBe(true);
    await office.hook(stopHook('agente-visitante', `agent-fl-${i}`));
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(6000);
  const stamps = await page.evaluate(() => (window as Dbg).__officeDebug!.frameTimestamps());
  let worst = 0;
  for (let i = 0, j = 0; i < stamps.length; i++) {
    while ((stamps[i] as number) - (stamps[j] as number) >= 1000) j++;
    worst = Math.max(worst, i - j + 1);
  }
  expect(worst).toBeLessThanOrEqual(30);
  FIXED_TYPES.forEach((type) => void office.hook(stopHook(type, `agent-all-${type}`)));
  await expect(page.getByText('Agentes 0/16')).toBeVisible({ timeout: 8000 });
  // Freelancers all left eventually (no ghost NPC after repeated arrive/leave).
  await expect
    .poll(async () => (await npcRows(page)).filter((r) => r.key.startsWith('freelancer:')).length, {
      timeout: 90_000,
    })
    .toBe(0);
  expect(SESSION_ID).toBeTruthy();
  expect(log.errors).toEqual([]);
  expect(log.notFound.filter((u) => !OPTIONAL_ASSETS.some((a) => u.startsWith(a)))).toEqual([]);
});
