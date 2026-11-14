import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { buildWeb } from '../helpers/appServer';
import {
  FIXTURES,
  OPTIONAL_ASSETS,
  SESSION_ID,
  npcRows,
  openReal,
  startHook,
  startRestartableOffice,
  watchConsole,
  type RestartableOffice,
} from './helpers';

// T-33 adversarial QA: hostile text (XSS), very long names, live edits of the team files,
// language switch with a panel open, keyboard reachability.

const XSS_IMG = '<img src=x onerror="window.__xss=1">';
const XSS_SCRIPT = '"><script>window.__xss=2</script>';
const XSS_SVG = '<svg onload="window.__xss=3">';
// nickname is capped at 24 characters by the schema: sentinel `window.x`.
const XSS_NICK = '<img src=x onerror=x=1>';

interface Agent {
  agentType: string;
  nickname: string;
  fullName: string;
  title: string;
  department: string;
  desk: string | null;
  provisional?: boolean;
  phrases: string[];
}
interface Team {
  studio: { name: string };
  departments: { id: string; name: string }[];
  agents: Agent[];
}

const baseTeam = (): Team =>
  JSON.parse(readFileSync(join(FIXTURES, 'escritorio', 'proposta.valid.json'), 'utf8')) as Team;

let dist: string;
let tmp: string;

test.beforeAll(async () => {
  dist = join(process.cwd(), 'test-results', 'web-dist-fase1-content');
  await buildWeb(dist);
  tmp = mkdtempSync(join(tmpdir(), 'qa-content-'));
});
test.afterAll(() => {
  rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

async function officeWith(team: Team): Promise<RestartableOffice> {
  const file = join(tmp, `escritorio-${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(file, JSON.stringify(team, null, 2));
  return startRestartableOffice(dist, { escritorio: file });
}

const xssFired = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { __xss?: number; x?: number };
    return w.__xss ?? w.x;
  });
const injectedNodes = (page: Page) =>
  page.evaluate(
    () => document.querySelectorAll('img[src="x"], svg[onload], body script:not([src])').length,
  );

async function openTeam(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Equipe' }).click();
  await expect(page.getByTestId('team-drawer')).toBeVisible();
}

test('CA-14: hostile HTML in names, titles, studio, project folder and task subject is shown as plain text everywhere (card, panel, team list, notice) and never runs', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const team = baseTeam();
  team.studio.name = XSS_IMG;
  const web = team.agents.find((a) => a.agentType === 'dev-web')!;
  web.nickname = XSS_NICK;
  web.fullName = XSS_SCRIPT;
  web.title = XSS_SVG;
  const dept = team.departments.find((d) => d.id === web.department)!;
  dept.name = '<b onmouseover="window.__xss=4">Eng</b>';
  const office = await officeWith(team);
  const log = watchConsole(page);
  page.on('dialog', (d) => {
    void d.dismiss();
    log.errors.push(`dialog: ${d.message()}`);
  });
  try {
    await openReal(office, page);
    // Hostile project folder (cwd basename) + hostile task subject on the working NPC.
    const cwd = `C:\\x\\${XSS_IMG}`;
    await office.hook(startHook('dev-web', 'agent-xss-1', cwd));
    await office.hook({
      hook_event_name: 'TaskCreated',
      session_id: SESSION_ID,
      cwd,
      agent_id: 'agent-xss-1',
      agent_type: 'dev-web',
      task: { id: 'T-99', subject: `${XSS_IMG} ${XSS_SVG}` },
    });
    // Hostile agent_type -> must become an "unknown" freelancer, never HTML.
    await office.hook(startHook(XSS_IMG, 'agent-xss-2'));
    await expect.poll(async () => (await npcRows(page)).length, { timeout: 5000 }).toBe(17);

    await expect(page.locator('.topbar__studio')).toHaveText(XSS_IMG);
    await openTeam(page);
    await expect(page.locator('button[data-npc="dev-web"]')).toContainText(XSS_NICK);
    await page.locator('button[data-npc="dev-web"]').focus();
    const card = page.getByTestId('npc-card');
    await expect(card).toBeVisible();
    await expect(card).toContainText(XSS_SCRIPT); // fullName as text
    await expect(card).toContainText(XSS_SVG); // title as text
    await page.locator('button[data-npc="dev-web"]').click();
    const panel = page.getByTestId('npc-panel');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText(XSS_SCRIPT);
    await expect(panel.getByTestId('npc-history')).toContainText(XSS_IMG); // hostile project folder as text

    expect(await injectedNodes(page)).toBe(0);
    expect(await xssFired(page)).toBeUndefined();
    expect(log.errors).toEqual([]);
  } finally {
    await office.cleanup();
  }
});

test('CA-21: a hire whose name is hostile HTML is announced as text in the notice bar and in the team list', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const office = await officeWith(baseTeam());
  const log = watchConsole(page);
  try {
    await openReal(office, page);
    const team = baseTeam();
    team.agents.push({
      agentType: 'dev-nova',
      nickname: XSS_NICK,
      fullName: 'Nova Pessoa Teste',
      title: 'Dev',
      department: 'engenharia',
      desk: null,
      provisional: true,
      phrases: ['oi'],
      sprite: 'npc-nova',
      badge: 'staff',
      isLead: false,
      personality: { traits: ['curiosa'], tone: 'x' },
    } as unknown as Agent);
    writeFileSync(join(office.claudeHome, 'equipe', 'escritorio.json'), JSON.stringify(team));
    await expect.poll(async () => (await npcRows(page)).length, { timeout: 15_000 }).toBe(17);
    await expect(page.getByTestId('notice')).toContainText(XSS_NICK);
    await openTeam(page);
    expect(await injectedNodes(page)).toBe(0);
    expect(await xssFired(page)).toBeUndefined();
    expect(log.errors).toEqual([]);
  } finally {
    await office.cleanup();
  }
});

test('CA-14: names near the schema limits (24 / 60 / 60 characters) keep the card inside the window and the page without horizontal scroll', async ({
  page,
}) => {
  const team = baseTeam();
  const web = team.agents.find((a) => a.agentType === 'dev-web')!;
  web.nickname = 'Maria-Fernanda-Albuq';
  web.fullName = 'Maria Fernanda de Albuquerque Montenegro Silva Santos Lima';
  web.title = 'Engenheira de Software Senior de Plataformas Distribuidas';
  team.studio.name = 'Estudio de Desenvolvimento de Sistemas LTDA';
  const office = await officeWith(team);
  try {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openReal(office, page);
    await openTeam(page);
    await page.locator('button[data-npc="dev-web"]').focus();
    const card = page.getByTestId('npc-card');
    await expect(card).toBeVisible();
    const box = (await card.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(1280);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(720);
    const overflow = await page.evaluate(() => ({
      page: document.documentElement.scrollWidth - window.innerWidth,
      drawer: (() => {
        const d = document.querySelector('[data-testid="team-drawer"]') as HTMLElement;
        return d.scrollWidth - d.clientWidth;
      })(),
      topbar: (() => {
        const t = document.querySelector('.topbar') as HTMLElement;
        return t.scrollWidth - t.clientWidth;
      })(),
    }));
    expect(overflow.page).toBeLessThanOrEqual(0);
    expect(overflow.drawer).toBeLessThanOrEqual(1);
    expect(overflow.topbar).toBeLessThanOrEqual(1);
    await page.locator('button[data-npc="dev-web"]').click();
    const panel = page.getByTestId('npc-panel');
    await expect(panel).toBeVisible();
    const pbox = (await panel.boundingBox())!;
    expect(pbox.x + pbox.width).toBeLessThanOrEqual(1280);
  } finally {
    await office.cleanup();
  }
});

test('CA-13: an invalid escritorio.json edited while the server runs keeps the last valid team and the 16 NPCs, and a fixed file is picked up again', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const office = await officeWith(baseTeam());
  const log = watchConsole(page);
  try {
    await openReal(office, page);
    const file = join(office.claudeHome, 'equipe', 'escritorio.json');
    for (const garbage of [
      '{ "schema": ',
      '',
      '[]',
      '{"schema":"escritorio/v1"}',
      '\u0000\u0000',
    ]) {
      writeFileSync(file, garbage);
      await page.waitForTimeout(1800);
      expect((await npcRows(page)).length).toBe(16);
      expect(await page.locator('.topbar__studio').innerText()).toBe('Estúdio do Carlos');
    }
    // The server itself keeps answering and still holds the last valid team.
    const state = await office.get('/api/state');
    expect(state.status).toBe(200);
    expect((JSON.parse(state.body) as { npcs: unknown[] }).npcs).toHaveLength(16);
    // Fix the file with a new studio name: picked up without reloading the page.
    const fixed = baseTeam();
    fixed.studio.name = 'Estúdio Novo';
    writeFileSync(file, JSON.stringify(fixed));
    await expect(page.locator('.topbar__studio')).toHaveText('Estúdio Novo', { timeout: 10_000 });
    expect(log.errors).toEqual([]);
  } finally {
    await office.cleanup();
  }
});

test('CA-13: BUG-01 the panel must show a warning naming the file and the field when escritorio.json is invalid', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const office = await officeWith(baseTeam());
  try {
    await openReal(office, page);
    writeFileSync(
      join(office.claudeHome, 'equipe', 'escritorio.json'),
      JSON.stringify({ ...baseTeam(), agents: [] }),
    );
    await page.waitForTimeout(2500);
    // Expected (CA-13): a visible notice that identifies the file ("escritorio.json") and the field ("agents").
    await expect(page.getByText(/escritorio\.json/i).first()).toBeVisible({ timeout: 3000 });
    const strip = page.getByTestId('diag-banner');
    await expect(strip).toHaveClass(/banner--warn/);
    await expect(strip).toContainText('agents');
    await expect(strip).toContainText('Mantendo a última configuração válida');
    await expect(strip).not.toContainText(/not found|invalid|Too small|expected/i); // no raw server English
  } finally {
    await office.cleanup();
  }
});

test('CA-13: a MISSING escritorio.json is not an alarm: a calm dismissible note, gone once the file exists', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const office = await startRestartableOffice(dist);
  try {
    await openReal(office, page);
    const strip = page.getByTestId('diag-banner');
    await expect(strip).toContainText('Usando a equipe de reserva do QUADRO.md');
    await expect(strip).not.toContainText('Problema em');
    await expect(strip).not.toContainText('not found'); // no raw server English
    await expect(strip).toHaveClass(/banner--info/);
    await expect(strip).not.toHaveClass(/banner--warn/);
    expect((await npcRows(page)).length).toBe(16);
    // Thin strip: it must not eat a big slice of the screen.
    expect((await strip.boundingBox())!.height).toBeLessThan(48);
    // Dismissible.
    await strip.getByRole('button', { name: 'Dispensar' }).click();
    await expect(page.getByTestId('team-missing-note')).toHaveCount(0);
  } finally {
    await office.cleanup();
  }
  const second = await startRestartableOffice(dist);
  try {
    await openReal(second, page);
    await expect(page.getByTestId('team-missing-note')).toBeVisible();
    writeFileSync(join(second.claudeHome, 'equipe', 'escritorio.json'), JSON.stringify(baseTeam()));
    await expect(page.getByTestId('team-missing-note')).toHaveCount(0, { timeout: 10_000 });
  } finally {
    await second.cleanup();
  }
});

test('CA-13: a QUADRO.md edited into garbage (reserve team, no escritorio.json) keeps the 16 NPCs and the page alive', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const office = await startRestartableOffice(dist);
  const log = watchConsole(page);
  try {
    await openReal(office, page);
    const file = join(office.claudeHome, 'equipe', 'QUADRO.md');
    const original = readFileSync(file, 'utf8');
    for (const garbage of [
      '',
      '| | |\n|---|',
      '# nada\n'.repeat(500),
      original.replace(/\|/g, '¦'),
    ]) {
      writeFileSync(file, garbage);
      await page.waitForTimeout(1500);
      expect((await npcRows(page)).length).toBe(16);
    }
    writeFileSync(file, original);
    await page.waitForTimeout(1500);
    expect((await npcRows(page)).length).toBe(16);
    expect(log.errors).toEqual([]);
  } finally {
    await office.cleanup();
  }
});

test('CA-10: switching the language with the NPC panel and the hover card open translates both in place, without closing them', async ({
  page,
}) => {
  const office = await officeWith(baseTeam());
  try {
    await openReal(office, page);
    await office.hook(startHook('dev-web', 'agent-i18n-1'));
    await openTeam(page);
    await page.locator('button[data-npc="dev-web"]').click();
    const panel = page.getByTestId('npc-panel');
    await expect(panel).toContainText('Histórico recente');
    await page.locator('button[data-npc="dev-web"]').focus();
    await expect(page.getByTestId('npc-card')).toContainText('Trabalhando');
    await page.getByRole('button', { name: /Mudar idioma/ }).click();
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('Recent history');
    await expect(panel).not.toContainText('Histórico recente');
    await expect(page.getByTestId('team-drawer')).toContainText('Team');
    expect(await page.evaluate(() => document.documentElement.lang)).toMatch(/^en/);
    // And back.
    await page.getByRole('button', { name: /Switch language to|Mudar idioma para/ }).click();
    await expect(panel).toContainText('Histórico recente');
  } finally {
    await office.cleanup();
  }
});

test('CA-23: Tab / Shift+Tab walk every control with a visible focus indicator, never trap the keyboard, and Esc unwinds panel -> drawer', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const office = await officeWith(baseTeam());
  try {
    await openReal(office, page);
    await openTeam(page);
    await page.locator('button[data-npc="dev-web"]').click();
    await expect(page.getByTestId('npc-panel')).toBeVisible();

    const seen: { label: string; ring: boolean }[] = [];
    await page.locator('body').click({ position: { x: 1, y: 1 } });
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    for (let i = 0; i < 90; i++) {
      await page.keyboard.press('Tab');
      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const cs = getComputedStyle(el);
        const ring =
          (cs.boxShadow !== 'none' && cs.boxShadow !== '') ||
          (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0);
        const r = el.getBoundingClientRect();
        return {
          label: `${el.tagName.toLowerCase()}:${el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 24) ?? ''}`,
          ring,
          visible: r.width > 0 && r.height > 0,
        };
      });
      if (info) seen.push({ label: info.label, ring: info.ring && info.visible });
    }
    expect(seen.length).toBeGreaterThan(20);
    // The loop wraps around (no trap): the first control shows up again.
    expect(seen.filter((s) => s.label === seen[0]!.label).length).toBeGreaterThan(1);
    // Focus must be visible on every stop except the canvas wrapper, which draws its own ring (checked below).
    const withoutRing = seen.filter((s) => !s.ring).map((s) => s.label);
    expect([...new Set(withoutRing)]).toEqual([]);

    // Shift+Tab goes backwards through the same controls.
    const first = await page.evaluate(() => document.activeElement?.textContent ?? '');
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.textContent ?? '')).toBe(first);

    // Esc unwinds: the panel first, then the drawer.
    await page.locator('button[data-npc="dev-web"]').focus();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('npc-panel')).toHaveCount(0);
    // Next Esc presses hide the hover card (focus on a row shows it), then close the drawer.
    for (let i = 0; i < 3 && (await page.getByTestId('team-drawer').count()) > 0; i++)
      await page.keyboard.press('Escape');
    await expect(page.getByTestId('team-drawer')).toHaveCount(0);
  } finally {
    await office.cleanup();
  }
});

test('CA-19: the NPC panel lists at least 10 recent activities with time and closes with Esc', async ({
  page,
}) => {
  const office = await officeWith(baseTeam());
  try {
    await openReal(office, page);
    await office.hook(startHook('dev-backend', 'agent-hist-1'));
    for (let i = 0; i < 14; i++) {
      await office.hook({
        hook_event_name: 'PreToolUse',
        session_id: SESSION_ID,
        cwd: 'C:\\dev\\Sites',
        agent_id: 'agent-hist-1',
        agent_type: 'dev-backend',
        tool_name: i % 2 ? 'Edit' : 'Read',
        tool_use_id: `toolu_hist_${i}`,
      });
    }
    await page.waitForTimeout(400);
    await openTeam(page);
    await page.locator('button[data-npc="dev-backend"]').click();
    const panel = page.getByTestId('npc-panel');
    await expect(panel).toBeVisible();
    const items = panel.getByTestId('npc-history').locator('li');
    await expect.poll(() => items.count(), { timeout: 5000 }).toBeGreaterThanOrEqual(10);
    // Each entry carries a time (HH:MM).
    for (const text of await items.allInnerTexts().then((all) => all.slice(0, 10)))
      expect(text).toMatch(/\d{1,2}:\d{2}/);
    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
  } finally {
    await office.cleanup();
  }
});

test('CA-19: BUG-02 clicking outside the NPC panel (on the map) must close it', async ({
  page,
}) => {
  const office = await officeWith(baseTeam());
  try {
    await openReal(office, page);
    await openTeam(page);
    await page.locator('button[data-npc="dev-backend"]').click();
    const panel = page.getByTestId('npc-panel');
    await expect(panel).toBeVisible();
    const canvas = (await page.getByTestId('office-canvas').boundingBox())!;
    await page.mouse.click(canvas.x + canvas.width / 2, canvas.y + canvas.height - 30);
    await expect(panel).toHaveCount(0, { timeout: 2000 });
  } finally {
    await office.cleanup();
  }
});

test('CA-14: BUG-03 an unbroken 60-character title must not make the team drawer scroll sideways', async ({
  page,
}) => {
  const team = baseTeam();
  team.agents.find((a) => a.agentType === 'dev-web')!.title = 'M'.repeat(60);
  const office = await officeWith(team);
  try {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openReal(office, page);
    await openTeam(page);
    const over = await page.evaluate(() => {
      const d = document.querySelector('[data-testid="team-drawer"]') as HTMLElement;
      return d.scrollWidth - d.clientWidth;
    });
    expect(over).toBeLessThanOrEqual(1);
  } finally {
    await office.cleanup();
  }
});

test('CA-09: the browser only talks to 127.0.0.1 (no CDN, no font host, no external request) while the office is used', async ({
  page,
}) => {
  const office = await officeWith(baseTeam());
  const outside: string[] = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (
      !['127.0.0.1', 'localhost'].includes(u.hostname) &&
      !['data:', 'blob:'].includes(u.protocol)
    )
      outside.push(r.url());
  });
  try {
    await openReal(office, page);
    await office.hook(startHook('dev-web', 'agent-net-1'));
    await openTeam(page);
    await page.locator('button[data-npc="dev-web"]').click();
    await page.getByRole('button', { name: /Mudar idioma/ }).click();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1500);
    expect(outside).toEqual([]);
  } finally {
    await office.cleanup();
  }
});

test('CA-12: the 16 NPCs of the approved escritorio.json show the right nickname, title and department in the team list', async ({
  page,
}) => {
  const team = baseTeam();
  const office = await officeWith(team);
  const log = watchConsole(page);
  try {
    await openReal(office, page);
    await openTeam(page);
    await expect(page.locator('.team-row')).toHaveCount(16);
    for (const a of team.agents) {
      const row = page.locator(`[data-npc="${a.agentType}"]`);
      await expect(row).toContainText(a.nickname);
      await expect(row).toContainText(a.title);
    }
    // The hover card adds the full name and the department of a sample.
    const sample = team.agents.find((a) => a.agentType === 'revisor-seguranca')!;
    await page.locator('button[data-npc="revisor-seguranca"]').focus();
    const card = page.getByTestId('npc-card');
    await expect(card).toContainText(sample.fullName);
    await expect(card).toContainText(
      team.departments.find((d) => d.id === sample.department)!.name,
    );
    expect(log.notFound.filter((u) => !OPTIONAL_ASSETS.some((a) => u.startsWith(a)))).toEqual([]);
    copyFileSync(join(office.claudeHome, 'equipe', 'escritorio.json'), join(tmp, 'copy.json'));
  } finally {
    await office.cleanup();
  }
});
