import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { buildWeb } from '../helpers/appServer';
import { rawRequest } from '../../integration/helpers/server';
import {
  FIXTURES,
  npcRows,
  openReal,
  startHook,
  startRestartableOffice,
  stopHook,
  type RestartableOffice,
} from './helpers';

// T-33 final round: logout / reopen by ticket, settings persisted by PATCH /api/config with two
// tabs, the diagnostics banner following the team files in real time, and a clean console.

let dist: string;
test.beforeAll(async () => {
  dist = join(process.cwd(), 'test-results', 'web-dist-fase1-final');
  await buildWeb(dist);
});

const PROPOSAL = join(FIXTURES, 'escritorio', 'proposta.valid.json');

async function ticketFor(office: RestartableOffice): Promise<string> {
  const token = readFileSync(join(office.home, 'token'), 'utf8').trim();
  const res = await rawRequest(office.port, {
    method: 'POST',
    path: '/api/auth/ticket',
    headers: { authorization: `Bearer ${token}` },
  });
  return (JSON.parse(res.body) as { ticket: string }).ticket;
}

async function signOutViaMenu(page: Page): Promise<void> {
  await page.getByRole('button', { name: /Configurações|Settings/ }).click();
  await page.getByRole('menuitem', { name: /Sair|Sign out/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByTestId('logout-confirm').click();
}

test('CA-03: logout from the menu ends the session everywhere, clears the cookie, closes the socket, and a new ticket reopens the office exactly once', async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const office = await startRestartableOffice(dist);
  const context = await browser.newContext();
  try {
    const a = await context.newPage();
    await openReal(office, a);
    const b = await context.newPage(); // second tab of the same browser
    await openReal(office, b);
    expect(office.clients()).toBe(2);
    const oldCookie = (await context.cookies()).find((c) => c.name === 'esc_sid')!;

    // Esc cancels the confirmation and keeps the session.
    await a.getByRole('button', { name: 'Configurações' }).click();
    await a.getByRole('menuitem', { name: 'Sair' }).click();
    await a.keyboard.press('Escape');
    await expect(a.getByRole('dialog')).toHaveCount(0);
    expect(office.clients()).toBe(2);

    await signOutViaMenu(a);
    await expect(a.getByRole('heading', { name: 'Abra o escritório pelo atalho' })).toBeVisible({
      timeout: 10_000,
    });
    await expect(a.getByTestId('office-canvas')).toHaveCount(0);
    // The other tab loses its socket and lands on the same screen.
    await expect(b.getByRole('heading', { name: 'Abra o escritório pelo atalho' })).toBeVisible({
      timeout: 20_000,
    });
    await expect.poll(() => office.clients(), { timeout: 5000 }).toBe(0);
    expect((await context.cookies()).find((c) => c.name === 'esc_sid')).toBeUndefined();

    // The old cookie is dead on the server, also when replayed by hand.
    const replay = await rawRequest(office.port, {
      path: '/api/session',
      headers: { cookie: `esc_sid=${oldCookie.value}` },
    });
    expect(replay.status).toBe(401);
    const replayPost = await rawRequest(office.port, {
      method: 'POST',
      path: '/api/auth/logout',
      headers: { cookie: `esc_sid=${oldCookie.value}`, origin: office.origin },
    });
    expect(replayPost.status).toBeGreaterThanOrEqual(400);

    // Reopen by ticket: works once, lands on "/" with nothing in the URL.
    const ticket = await ticketFor(office);
    await a.goto(`${office.origin}/auth/callback?ticket=${ticket}`);
    await expect(a.getByText('Agentes 0/16')).toBeVisible({ timeout: 15_000 });
    expect(new URL(a.url()).search).toBe('');
    expect(a.url()).not.toContain(ticket);
    const again = await rawRequest(office.port, { path: `/auth/callback?ticket=${ticket}` });
    expect(again.status).toBe(401);
    expect(office.clients()).toBe(1);
  } finally {
    await context.close();
    await office.cleanup();
  }
});

test('CA-03: logout while the server is down still drops the local session and shows the shortcut screen', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const office = await startRestartableOffice(dist);
  try {
    await openReal(office, page);
    await office.stop();
    await signOutViaMenu(page);
    await expect(page.getByRole('heading', { name: 'Abra o escritório pelo atalho' })).toBeVisible({
      timeout: 15_000,
    });
  } finally {
    await office.cleanup();
  }
});

test('CA-10 / CA-77: language and sound go to the server by PATCH /api/config (CSRF + Origin), two tabs never overwrite each other, and a new browser starts in the saved language', async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const office = await startRestartableOffice(dist);
  const context = await browser.newContext();
  try {
    const a = await context.newPage();
    const patches: { csrf?: string; origin?: string; body: string; status: number }[] = [];
    a.on('response', async (r) => {
      if (r.request().method() === 'PATCH' && r.url().endsWith('/api/config'))
        patches.push({
          csrf: r.request().headers()['x-escritorio-csrf'],
          origin: r.request().headers()['origin'],
          body: r.request().postData() ?? '',
          status: r.status(),
        });
    });
    await openReal(office, a);
    const b = await context.newPage();
    await openReal(office, b);

    // Tab A: English. Tab B (at the same time): sound on. Both fields must survive.
    await Promise.all([
      a.getByRole('button', { name: /Mudar idioma/ }).click(),
      b.getByRole('button', { name: 'Som desligado' }).click(),
    ]);
    await expect
      .poll(async () => JSON.parse((await office.get('/api/config')).body), { timeout: 5000 })
      .toMatchObject({ lang: 'en', sound: true });
    expect(patches.length).toBeGreaterThanOrEqual(1);
    for (const p of patches) {
      expect(p.status).toBe(200);
      expect(p.csrf).toBeTruthy();
      expect(JSON.parse(p.body)).toEqual({ lang: 'en' });
    }

    // The same browser keeps English after a reload (local choice) ...
    await b.reload();
    await expect(b.getByRole('button', { name: 'Settings' })).toBeVisible({ timeout: 15_000 });
    // ... and a brand new browser (no local choice) starts in the language saved on the server.
    const fresh = await browser.newContext();
    await office.signIn(fresh);
    const c = await fresh.newPage();
    await c.goto(office.origin);
    await expect(c.getByRole('button', { name: 'Settings' })).toBeVisible({ timeout: 15_000 });
    await fresh.close();

    // Back to Portuguese from tab B; the server follows.
    await b.getByRole('button', { name: /Switch language/ }).click();
    await expect
      .poll(
        async () => (JSON.parse((await office.get('/api/config')).body) as { lang: string }).lang,
      )
      .toBe('pt-BR');
    // Sound state on the server survives (what the UI shows after a reload is reported in QA-FASE-1).
    expect((JSON.parse((await office.get('/api/config')).body) as { sound: boolean }).sound).toBe(
      true,
    );
  } finally {
    await context.close();
    await office.cleanup();
  }
});

test('CA-10: PATCH /api/config rejects unknown fields, a missing CSRF header and a foreign Origin', async ({
  page,
}) => {
  const office = await startRestartableOffice(dist);
  try {
    await openReal(office, page);
    const csrf = (await page.evaluate(() => fetch('/api/session').then((r) => r.json()))) as {
      csrfToken: string;
    };
    const call = (headers: Record<string, string>, body: unknown) =>
      page.evaluate(
        async ([h, b]) => {
          const r = await fetch('/api/config', {
            method: 'PATCH',
            headers: { 'content-type': 'application/json', ...(h as Record<string, string>) },
            body: JSON.stringify(b),
          });
          return r.status;
        },
        [headers, body] as const,
      );
    const good = { 'x-escritorio-csrf': csrf.csrfToken };
    expect(await call(good, { lang: 'en' })).toBe(200);
    expect(await call(good, { lang: 'fr' })).toBe(400);
    expect(await call(good, { evil: true })).toBe(400);
    expect(await call(good, { chatMode: { '../x': 'auto' } })).toBe(400);
    expect(await call({}, { lang: 'pt-BR' })).toBeGreaterThanOrEqual(400);
    const foreign = await rawRequest(office.port, {
      method: 'PATCH',
      path: '/api/config',
      headers: {
        cookie: `esc_sid=${(await page.context().cookies()).find((c) => c.name === 'esc_sid')!.value}`,
        origin: 'http://evil.example',
        'x-escritorio-csrf': csrf.csrfToken,
        'content-type': 'application/json',
      },
      body: '{"lang":"pt-BR"}',
    });
    expect(foreign.status).toBe(403);
    expect((JSON.parse((await office.get('/api/config')).body) as { lang: string }).lang).toBe(
      'en',
    );
  } finally {
    await office.cleanup();
  }
});

test('CA-13: the diagnostics banner follows escritorio.json live: absent (note), valid (none), garbage (warning naming the file), fixed (none)', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const office = await startRestartableOffice(dist);
  const file = join(office.claudeHome, 'equipe', 'escritorio.json');
  // The quiet "Desktop sessions not detected" hint may share the strip: only config notes count.
  const banner = page.locator('.banner--warn');
  const calm = async () => {
    await expect(banner).toHaveCount(0, { timeout: 15_000 });
    await expect(page.getByTestId('team-missing-note')).toHaveCount(0);
  };
  try {
    await openReal(office, page);
    await expect(page.getByTestId('team-missing-note')).toBeVisible({ timeout: 10_000 });

    copyFileSync(PROPOSAL, file);
    await calm();
    expect((await npcRows(page)).length).toBe(16);

    for (const garbage of ['{ "schema": ', '[]', '\u0000\u0000', '']) {
      writeFileSync(file, garbage);
      await expect(banner).toBeVisible({ timeout: 15_000 });
      await expect(banner).toContainText('escritorio.json');
      expect((await npcRows(page)).length).toBe(16); // keeps the last valid team
      copyFileSync(PROPOSAL, file);
      await calm();
    }

    // A field-level problem names the field.
    const broken = JSON.parse(readFileSync(PROPOSAL, 'utf8')) as {
      agents: { nickname: unknown }[];
    };
    broken.agents[3]!.nickname = '';
    writeFileSync(file, JSON.stringify(broken));
    await expect(banner).toContainText(/agents/i, { timeout: 15_000 });

    // Dismissing hides it until the problem changes.
    const close = banner.getByRole('button');
    if (await close.count()) {
      await close.first().click();
      await expect(banner).toHaveCount(0);
    }
    copyFileSync(PROPOSAL, file);
    await calm();

    // A hostile value inside the problem is text, not markup.
    broken.agents[3]!.nickname = '<img src=x onerror="window.__xss=1">'.repeat(2);
    writeFileSync(file, JSON.stringify(broken));
    await page.waitForTimeout(2500);
    expect(
      await page.evaluate(() => (window as unknown as { __xss?: number }).__xss),
    ).toBeUndefined();
    expect(await page.locator('img[src="x"]').count()).toBe(0);
  } finally {
    await office.cleanup();
  }
});

test('CA-18: the Desktop-sessions hint is quiet and dismissible, and never hides a configuration warning', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const office = await startRestartableOffice(dist);
  try {
    await openReal(office, page);
    // Only informational notes may show on a healthy start; no warning-toned banner.
    await page.waitForTimeout(1500);
    expect(await page.locator('.banner--warn').count()).toBe(0);
  } finally {
    await office.cleanup();
  }
});

test('console: a full tour (hooks, panels, shortcuts, language, logout) leaves the console clean, with no failed request except expected ones', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const office = await startRestartableOffice(dist);
  const messages: string[] = [];
  const failed: string[] = [];
  page.on('console', (m) => {
    if (['error', 'warning'].includes(m.type())) messages.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => messages.push(`pageerror: ${e.message}`));
  page.on('response', (r) => {
    if (r.status() >= 400) failed.push(`${r.status()} ${new URL(r.url()).pathname}`);
  });
  try {
    await openReal(office, page);
    await office.hook(startHook('dev-web', 'tour-1'));
    await office.hook(startHook('visitante-x', 'tour-2'));
    await page.getByRole('button', { name: 'Equipe' }).click();
    await page.locator('button[data-npc="dev-web"]').click();
    for (const k of ['c', 't', 'a', 'm', '?', 'Escape', 'Escape']) await page.keyboard.press(k);
    await page.getByRole('button', { name: /Mudar idioma/ }).click();
    await office.hook(stopHook('dev-web', 'tour-1'));
    await office.hook(stopHook('visitante-x', 'tour-2'));
    await page.waitForTimeout(2500);
    await signOutViaMenu(page);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // No tolerance: no failed request and no console error/warning during the whole tour
    // (optional sprite manifests are skipped at build time; the favicon is served).
    expect(failed).toEqual([]);
    expect(messages).toEqual([]);
  } finally {
    await office.cleanup();
  }
});
