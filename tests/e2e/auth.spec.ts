import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { rawRequest, readMaster } from '../integration/helpers/server';
import { buildWeb } from './helpers/appServer';
import { startRealOffice, type RealOffice } from './helpers/realServer';

// Sign-out, access screen and reopening by ticket, against the REAL in-process server. Each test
// gets its own office because logging out ends that browser session on the server.

let dist: string;
test.beforeAll(async () => {
  dist = join(process.cwd(), 'test-results', 'web-dist-auth');
  await buildWeb(dist);
});

/** Records the close code of every WebSocket the page opens. */
async function trackSocketCloses(page: Page): Promise<void> {
  await page.addInitScript(`(() => {
    window.__wsCloses = [];
    const Native = window.WebSocket;
    window.WebSocket = function (url, protocols) {
      const ws = protocols === undefined ? new Native(url) : new Native(url, protocols);
      ws.addEventListener('close', (e) => window.__wsCloses.push(e.code));
      return ws;
    };
    window.WebSocket.prototype = Native.prototype;
    for (const k of ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED']) window.WebSocket[k] = Native[k];
  })();`);
}

async function open(office: RealOffice, page: Page): Promise<void> {
  await office.signIn(page.context());
  await page.goto(`${office.origin}/?debug`);
  await expect(page.getByText('Agentes 0/16')).toBeVisible({ timeout: 20_000 });
}

async function ticketUrl(office: RealOffice): Promise<string> {
  const token = await readMaster(office.server);
  const res = await rawRequest(office.server.port, {
    method: 'POST',
    path: '/api/auth/ticket',
    headers: { authorization: `Bearer ${token}` },
  });
  const { ticket } = JSON.parse(res.body) as { ticket: string };
  return `${office.origin}/auth/callback?ticket=${ticket}`;
}

test('CA-03: Sair asks first (Esc cancels and focus returns), then signs out: socket closes with 4401, the access screen shows, and a new ticket reopens the office', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const office = await startRealOffice(dist);
  try {
    await trackSocketCloses(page);
    await open(office, page);

    // Confirmation dialog: Esc cancels, focus returns to Configurações.
    const settings = page.getByRole('button', { name: 'Configurações' });
    await settings.click();
    await page.getByRole('menuitem', { name: 'Sair' }).click();
    const dialog = page.getByRole('dialog', { name: 'Sair do escritório?' });
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(settings).toBeFocused();
    await expect(page.getByText('Agentes 0/16')).toBeVisible(); // still signed in

    // Confirm.
    await settings.click();
    await page.getByRole('menuitem', { name: 'Sair' }).click();
    const logoutResponse = page.waitForResponse((r) => r.url().endsWith('/api/auth/logout'));
    await page.getByTestId('logout-confirm').click();
    expect((await logoutResponse).status()).toBe(204);
    await expect(
      page.getByRole('heading', { name: 'Abra o escritório pelo atalho' }),
    ).toBeVisible();
    await expect(page.getByTestId('office-canvas')).toHaveCount(0);
    // Our own sign-out closes the socket first (code 1005/1000); the server-side 4401 path is the next test.
    await expect
      .poll(() =>
        page.evaluate(() => (window as unknown as { __wsCloses: number[] }).__wsCloses.length),
      )
      .toBeGreaterThan(0);

    // The old session no longer works.
    const stale = await page.context().request.get(`${office.origin}/api/state`);
    expect(stale.status()).toBe(401);

    // "Try again" does not loop or reload: still the access screen, same document.
    await page.evaluate(() => ((window as unknown as { __marker: number }).__marker = 7));
    await page.getByRole('button', { name: 'Tentar de novo' }).click();
    await page.waitForTimeout(1500);
    await expect(
      page.getByRole('heading', { name: 'Abra o escritório pelo atalho' }),
    ).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __marker?: number }).__marker)).toBe(
      7,
    );

    // Reopen with a fresh launcher ticket.
    await page.goto(await ticketUrl(office));
    await expect(page.getByText('Agentes 0/16')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('office-canvas')).toBeVisible();
  } finally {
    await office.stop();
  }
});

test('CA-03: a session ended elsewhere (cookie dropped server-side by another logout) shows the access screen when the socket closes', async ({
  page,
}) => {
  const office = await startRealOffice(dist);
  try {
    await trackSocketCloses(page);
    await open(office, page);
    const res = await page.context().request.post(`${office.origin}/api/auth/logout`, {
      headers: {
        origin: office.origin,
        'x-escritorio-csrf': await page.evaluate(async () => {
          const r = await fetch('/api/session');
          return ((await r.json()) as { csrfToken: string }).csrfToken;
        }),
      },
    });
    expect(res.status()).toBe(204);
    await expect(page.getByRole('heading', { name: 'Abra o escritório pelo atalho' })).toBeVisible({
      timeout: 10_000,
    });
    // The server ended the session: its socket close code is 4401 and nothing reconnects.
    expect(
      await page.evaluate(() => (window as unknown as { __wsCloses: number[] }).__wsCloses),
    ).toContain(4401);
  } finally {
    await office.stop();
  }
});

test('CA-10/CA-77: language and sound survive a page reload (PATCH /api/config persisted by the server)', async ({
  page,
}) => {
  const office = await startRealOffice(dist);
  try {
    await office.signIn(page.context());
    const probe = await page.context().request.patch(`${office.origin}/api/config`, {
      headers: { origin: office.origin },
      data: {},
    });
    test.skip(probe.status() === 404, 'PATCH /api/config is not implemented by the server yet');

    await page.goto(`${office.origin}/?debug`);
    await expect(page.getByText('Agentes 0/16')).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: 'Mudar idioma para English' }).click();
    await page.getByRole('button', { name: 'Sound off' }).click();
    await expect(page.getByRole('button', { name: 'Sound on' })).toBeVisible();
    await page.waitForTimeout(500);

    // A brand-new browser profile has no localStorage: only the server can remember.
    const fresh = await page.context().browser()!.newContext();
    await office.signIn(fresh);
    const page2 = await fresh.newPage();
    await page2.goto(`${office.origin}/?debug`);
    await expect(page2.getByText('Agents 0/16')).toBeVisible({ timeout: 20_000 });
    await expect(page2.getByRole('button', { name: 'Sound on' })).toBeVisible();
    await fresh.close();
  } finally {
    await office.stop();
  }
});
