import { join } from 'node:path';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { integerScale } from '../../src/shared/world/camera';
import { buildWeb, CSRF_TOKEN, startAppServer, type AppServer } from './helpers/appServer';
import type { OfficeSnapshot } from '../../src/shared/contracts';
import { e2eSnapshot, mockSocket } from './helpers/mockSocket';

// The web build is served by a small test server (the real Fastify server belongs to another
// block); the WebSocket is mocked per page. Edge (channel msedge) is configured in playwright.config.ts.

let server: AppServer;

test.beforeAll(async () => {
  const dist = join(process.cwd(), 'test-results', 'web-dist');
  await buildWeb(dist);
  server = await startAppServer(dist);
});

test.afterAll(async () => {
  await server.close();
});

test.beforeEach(() => server.setSession('ok'));

type DebugWindow = Window & {
  __officeDebug?: {
    engine: {
      zoom: number;
      tileToCss: (x: number, y: number) => { x: number; y: number } | null;
      debugSprites: () => { id: string; x: number; y: number }[];
    };
    metrics: () => {
      rendered: number;
      renderedWhileHidden: number;
      fps: number;
      scale: number;
      dpr: number;
      zoom: number;
      canvasWidth: number;
      canvasHeight: number;
      frameMsP95: number;
    };
    crispness: () => { worldColors: number; presentedColors: number; foreign: number };
    frameTimestamps: () => number[];
    rooms: string[];
    diagnostics: string[];
  };
};

async function openOffice(page: Page, query = '?debug', snapshot?: OfficeSnapshot): Promise<void> {
  await mockSocket(page, snapshot);
  await page.goto(`${server.url}/${query}`);
  await page.waitForFunction(
    () => ((window as DebugWindow).__officeDebug?.metrics().rendered ?? 0) > 2,
    undefined,
    {
      timeout: 20_000,
    },
  );
}

const metrics = (page: Page) =>
  page.evaluate(() => (window as DebugWindow).__officeDebug!.metrics());

async function setHidden(page: Page, hidden: boolean): Promise<void> {
  await page.evaluate((h) => {
    const state = h ? 'hidden' : 'visible';
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
}

test.describe('shell and HUD', () => {
  test('CA-80: loads the office with the top bar, studio name, clock, counters and a muted sound button', async ({
    page,
  }) => {
    await openOffice(page);
    await expect(page.getByRole('banner')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Estúdio Teste');
    await expect(page.getByText('Agentes 3/16')).toBeVisible();
    await expect(page.getByText('Projetos ativos: 2')).toBeVisible();
    const sound = page.getByRole('button', { name: 'Som desligado' });
    await expect(sound).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('time')).toHaveText(/^\d{2}:\d{2}$/);
    await expect(page.getByTestId('office-canvas')).toBeVisible();
    // Brasília time, whatever the machine's zone is.
    const shown = await page.locator('time').textContent();
    const expected = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(new Date());
    const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
    expect(Math.abs(toMin(shown ?? '00:00') - toMin(expected))).toBeLessThanOrEqual(1);
  });

  test('CA-82: the local OFL fonts load (Pixelify Sans for the UI, Silkscreen for signs), no CDN', async ({
    page,
  }) => {
    const external: string[] = [];
    page.on('request', (r) => {
      if (!r.url().startsWith(server.url) && !r.url().startsWith('ws:')) external.push(r.url());
    });
    await openOffice(page);
    await page.evaluate(async () => {
      await Promise.all([
        document.fonts.load('16px "Pixelify Sans"'),
        document.fonts.load('16px "Silkscreen"'),
      ]);
    });
    const loaded = await page.evaluate(() =>
      [...document.fonts]
        .filter((f) => f.status === 'loaded')
        .map((f) => f.family.replace(/"/g, '')),
    );
    expect(loaded).toContain('Pixelify Sans');
    expect(loaded).toContain('Silkscreen');
    expect(await page.evaluate(() => document.fonts.check('16px "Pixelify Sans"'))).toBe(true);
    const bodyFont = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    expect(bodyFont).toContain('Pixelify Sans');
    expect(bodyFont).toMatch(/monospace/); // fallback kept
    expect(external).toEqual([]);
  });

  test('CA-03: without a session the page shows "open from the shortcut" and never draws the office', async ({
    page,
  }) => {
    server.setSession('unauthorized');
    await mockSocket(page);
    await page.goto(server.url);
    await expect(
      page.getByRole('heading', { name: 'Abra o escritório pelo atalho' }),
    ).toBeVisible();
    await expect(page.getByTestId('office-canvas')).toHaveCount(0);
  });

  test('CA-10: switching language changes every text without reloading, and the choice persists', async ({
    page,
  }) => {
    await openOffice(page);
    await page.evaluate(() => ((window as unknown as { __marker: number }).__marker = 42));
    await page.getByRole('button', { name: 'Mudar idioma para English' }).click();
    await expect(page.getByText('Agents 3/16')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sound off' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Settings' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page).toHaveTitle('Team Office');
    expect(await page.evaluate(() => (window as unknown as { __marker?: number }).__marker)).toBe(
      42,
    ); // no reload
    // The language is saved on the server through the closed-list PATCH, with CSRF.
    await expect.poll(() => server.patches.length).toBeGreaterThan(0);
    const patch = server.patches.at(-1);
    expect(patch?.body).toEqual({ lang: 'en' });
    expect(patch?.csrf).toBe(CSRF_TOKEN);

    await page.reload();
    await expect(page.getByText('Agents 3/16')).toBeVisible();
    await page.getByRole('button', { name: 'Switch language to Português (Brasil)' }).click();
    await expect(page.getByText('Agentes 3/16')).toBeVisible();
  });

  test('CA-77: sound starts muted and toggles with aria-pressed', async ({ page }) => {
    await openOffice(page);
    const sound = page.getByRole('button', { name: /^Som/ });
    await expect(sound).toHaveText('Som desligado');
    await sound.click();
    await expect(page.getByRole('button', { name: 'Som ligado' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('CA-23: Tab reaches every top-bar control with a visible focus ring', async ({ page }) => {
    await openOffice(page);
    const visited: string[] = [];
    for (let i = 0; i < 14; i++) {
      await page.keyboard.press('Tab');
      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement;
        const s = getComputedStyle(el);
        return {
          label: el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 40) ?? '',
          ring: s.boxShadow !== 'none' || s.outlineStyle !== 'none',
          tag: el.tagName,
        };
      });
      if (info.tag === 'BODY') continue; // focus is on the page itself, not on a control
      visited.push(info.label);
      expect(info.ring, 'focus ring on ' + info.label).toBe(true);
    }
    expect(visited.some((l) => l.includes('Som'))).toBe(true);
    expect(visited.some((l) => l.includes('Mudar idioma'))).toBe(true);
    expect(visited.some((l) => l.includes('Configurações'))).toBe(true);
    expect(
      visited.some((l) => l.includes('Zoom') || l.includes('Aproximar') || l.includes('Afastar')),
    ).toBe(true);
  });

  test('CA-23: C, T, A and M toggle the panels and Esc closes them', async ({ page }) => {
    await openOffice(page);
    for (const [key, panel] of [
      ['c', 'chat'],
      ['t', 'tasks'],
      ['a', 'approvals'],
      ['m', 'map'],
    ] as const) {
      await page.keyboard.press(key);
      await expect(page.locator(`[data-panel="${panel}"]`)).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator('[data-panel]')).toHaveCount(0);
    }
    await page.keyboard.press('c');
    await page.keyboard.press('c');
    await expect(page.locator('[data-panel]')).toHaveCount(0);
  });

  test('CA-23: the letter shortcuts do not fire while typing in a text field', async ({ page }) => {
    await openOffice(page);
    await page.evaluate(() => {
      const input = document.createElement('input');
      input.type = 'text';
      input.id = 'probe';
      document.body.appendChild(input);
      const area = document.createElement('textarea');
      area.id = 'probe-area';
      document.body.appendChild(area);
    });
    await page.locator('#probe').focus();
    await page.keyboard.type('ctam?');
    await expect(page.locator('#probe')).toHaveValue('ctam?');
    await page.locator('#probe-area').focus();
    await page.keyboard.type('ctam');
    await expect(page.locator('[data-panel]')).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('CA-05: Credits opens from the settings menu, names Pixel Agents (MIT), closes with Esc and returns focus', async ({
    page,
  }) => {
    await openOffice(page);
    const settings = page.getByRole('button', { name: 'Configurações' });
    await settings.click();
    await page.getByRole('menuitem', { name: 'Créditos' }).click();
    const dialog = page.getByRole('dialog', { name: 'Créditos' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('link', { name: 'Pixel Agents' })).toBeVisible();
    await expect(dialog.getByRole('cell', { name: 'MIT' }).first()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(settings).toBeFocused();
  });

  test('CA-23: the shortcuts list opens with ? and traps Tab inside the dialog', async ({
    page,
  }) => {
    await openOffice(page);
    await page.keyboard.press('?');
    const dialog = page.getByRole('dialog', { name: 'Atalhos de teclado' });
    await expect(dialog).toBeVisible();
    for (let i = 0; i < 4; i++) await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(
      true,
    );
  });

  test('CA-12: shows an offline banner with a countdown when the socket drops, then recovers with a new snapshot', async ({
    page,
  }) => {
    let connections = 0;
    const snapshot = e2eSnapshot();
    await page.routeWebSocket(/\/ws$/, (ws) => {
      connections++;
      if (connections === 1) {
        ws.close();
        return;
      }
      ws.send(JSON.stringify({ t: 'snapshot', snapshot }));
    });
    await page.goto(`${server.url}/?debug`);
    await expect(page.getByText(/Sem conexão com o servidor/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tentar agora' })).toBeVisible();
    await expect(page.getByText('Agentes 3/16')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Sem conexão com o servidor/)).toHaveCount(0);
    expect(connections).toBeGreaterThanOrEqual(2);
  });
});

test.describe('engine (CA-06, CA-07, CA-80)', () => {
  test('CA-06: never more than 30 rendered frames in any 1 s window, with 20 NPCs walking', async ({
    page,
  }) => {
    await openOffice(page, '?debug&demo=20&zoom=3');
    await page.waitForTimeout(12_000);
    const stamps = await page.evaluate(() =>
      (window as DebugWindow).__officeDebug!.frameTimestamps(),
    );
    expect(stamps.length).toBeGreaterThan(150);
    let worst = 0;
    for (let i = 0, j = 0; i < stamps.length; i++) {
      while ((stamps[i] as number) - (stamps[j] as number) >= 1000) j++;
      worst = Math.max(worst, i - j + 1);
    }
    expect(worst).toBeLessThanOrEqual(30);
    const m = await metrics(page);
    expect(m.fps).toBeLessThanOrEqual(30);
  });

  test('CA-06: an idle office (nobody walking) renders at the slow ambient rate', async ({
    page,
  }) => {
    const idle = e2eSnapshot();
    idle.npcs = idle.npcs.map((n) => ({ ...n, status: 'idle' as const, activeCount: 0 }));
    await openOffice(page, '?debug', idle);
    const a = (await metrics(page)).rendered;
    await page.waitForTimeout(3_000);
    const b = (await metrics(page)).rendered;
    expect((b - a) / 3).toBeLessThanOrEqual(12);
    expect(b - a).toBeGreaterThan(5);
  });

  test('M-02: an idle office keeps the page main thread under 10% busy (no render loops)', async ({
    page,
  }) => {
    await openOffice(page);
    await page.waitForTimeout(2_000);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    const task = async () =>
      (
        (await cdp.send('Performance.getMetrics')) as { metrics: { name: string; value: number }[] }
      ).metrics.find((m) => m.name === 'TaskDuration')?.value ?? 0;
    const t0 = await task();
    await page.waitForTimeout(4_000);
    const busy = ((await task()) - t0) / 4;
    expect(busy).toBeLessThan(0.1);
  });

  test('CA-07: a hidden tab renders zero frames, NPCs do not teleport, and it resumes within 500 ms', async ({
    page,
  }) => {
    await openOffice(page, '?debug&demo=8&seed=3');
    await page.waitForTimeout(500);
    await setHidden(page, true);
    await page.waitForTimeout(200);
    const before = await metrics(page);
    const posBefore = await page.evaluate(() =>
      (window as DebugWindow).__officeDebug!.engine.debugSprites(),
    );
    await page.waitForTimeout(3_000);
    const during = await metrics(page);
    expect(during.rendered).toBe(before.rendered);
    expect(during.renderedWhileHidden).toBe(0);

    const resumeMs = await page.evaluate(async () => {
      const dbg = (window as DebugWindow).__officeDebug!;
      const start = dbg.metrics().rendered;
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'visible',
      });
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
      const t0 = performance.now();
      document.dispatchEvent(new Event('visibilitychange'));
      while (dbg.metrics().rendered === start) {
        if (performance.now() - t0 > 2000) return Infinity;
        await new Promise((r) => setTimeout(r, 5));
      }
      return performance.now() - t0;
    });
    expect(resumeMs).toBeLessThanOrEqual(500);
    const posAfter = await page.evaluate(() =>
      (window as DebugWindow).__officeDebug!.engine.debugSprites(),
    );
    // Three seconds in the background must not have moved anybody more than ~one clamped step (100 ms * 48 px/s) plus the resume frame.
    for (const a of posAfter) {
      const b = posBefore.find((p) => p.id === a.id);
      if (!b) continue;
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(24);
    }
  });

  test('CA-11: every fixed room is in the world and the scene is painted', async ({ page }) => {
    await openOffice(page);
    const rooms = await page.evaluate(() => (window as DebugWindow).__officeDebug!.rooms);
    for (const id of [
      'DIR',
      'REU',
      'PLN',
      'ENG',
      'QUA',
      'SOC',
      'COR1',
      'COR2',
      'ENT',
      'BIB',
      'REC',
      'COP',
      'WC',
      'TER',
      'SRV',
      'PRJ1',
      'PRJ2',
      'PRJ3',
      'PRJ4',
    ]) {
      expect(rooms).toContain(id);
    }
    const c = await page.evaluate(() => (window as DebugWindow).__officeDebug!.crispness());
    expect(c.worldColors).toBeGreaterThan(40);
  });

  test('CA-80: wheel zooms in whole steps 2x/3x/4x anchored on the cursor and drag pans', async ({
    page,
  }) => {
    await openOffice(page, '?debug&zoom=2');
    const canvas = page.getByTestId('office-canvas');
    const box = (await canvas.boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.wheel(0, -120);
    await expect(page.getByText('Zoom 3×')).toBeVisible();
    await page.waitForTimeout(200);
    await page.mouse.wheel(0, -120);
    await expect(page.getByText('Zoom 4×')).toBeVisible();
    await page.waitForTimeout(200);
    await page.mouse.wheel(0, -120);
    await expect(page.getByText('Zoom 4×')).toBeVisible(); // capped
    expect((await metrics(page)).zoom).toBe(4);

    const before = await page.evaluate(() =>
      (window as DebugWindow).__officeDebug!.engine.tileToCss(10, 10),
    );
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 120, cy + 60, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    const after = await page.evaluate(() =>
      (window as DebugWindow).__officeDebug!.engine.tileToCss(10, 10),
    );
    expect(after!.x - before!.x).toBeGreaterThan(60);
    expect(after!.y - before!.y).toBeGreaterThan(30);
  });

  test('CA-80: the arrow keys move the camera and + / - change the zoom when the map has focus', async ({
    page,
  }) => {
    await openOffice(page, '?debug&zoom=3');
    await page.getByTestId('office-canvas').focus();
    const before = await page.evaluate(() =>
      (window as DebugWindow).__officeDebug!.engine.tileToCss(10, 10),
    );
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(300);
    const after = await page.evaluate(() =>
      (window as DebugWindow).__officeDebug!.engine.tileToCss(10, 10),
    );
    expect(after!.x).toBeLessThan(before!.x);
    await page.keyboard.press('-');
    await expect(page.getByText('Zoom 2×')).toBeVisible();
  });
});

async function crispAt(browser: Browser, dpr: number, zoom: 2 | 3 | 4) {
  const context = await browser.newContext({
    deviceScaleFactor: dpr,
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();
  try {
    await openOffice(page, `?debug&demo=10&zoom=${zoom}`);
    await page.waitForTimeout(600);
    const m = await metrics(page);
    const c = await page.evaluate(() => (window as DebugWindow).__officeDebug!.crispness());
    return { m, c };
  } finally {
    await context.close();
  }
}

test.describe('crisp pixels (R4, CA-80)', () => {
  for (const dpr of [1, 1.25, 1.5]) {
    for (const zoom of [2, 3] as const) {
      test(`CA-80: DPR ${dpr}, zoom ${zoom}x: integer scale and no interpolated colours`, async ({
        browser,
      }) => {
        const { m, c } = await crispAt(browser, dpr, zoom);
        expect(m.dpr).toBeCloseTo(dpr, 5);
        expect(m.scale).toBe(integerScale(zoom, dpr));
        expect(Number.isInteger(m.scale)).toBe(true);
        // The bitmap is sized in device pixels (no browser-side resampling of the canvas).
        expect(Math.abs(m.canvasWidth - 1280 * dpr)).toBeLessThanOrEqual(1);
        expect(c.presentedColors).toBeGreaterThan(20);
        expect(c.foreign).toBe(0);
      });
    }
  }
});
