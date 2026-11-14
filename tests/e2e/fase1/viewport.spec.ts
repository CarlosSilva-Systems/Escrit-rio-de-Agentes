import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { buildWeb } from '../helpers/appServer';
import {
  FIXED_TYPES,
  OPTIONAL_ASSETS,
  openReal,
  npcRows,
  startHook,
  startRestartableOffice,
  stopHook,
  watchConsole,
  type Dbg,
  type RestartableOffice,
} from './helpers';

// T-33 adversarial QA: window sizes, pixel density, zoom/pan extremes, reduced motion,
// hidden tab with activity, burst of events, weird URL parameters.

let office: RestartableOffice;

test.beforeAll(async () => {
  const dist = join(process.cwd(), 'test-results', 'web-dist-fase1-viewport');
  await buildWeb(dist);
  office = await startRestartableOffice(dist);
});
test.afterAll(async () => {
  await office.cleanup();
});

const metrics = (page: Page) => page.evaluate(() => (window as Dbg).__officeDebug!.metrics());

async function layout(page: Page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="office-canvas"]') as HTMLCanvasElement;
    const r = canvas.getBoundingClientRect();
    const top = document.querySelector('.topbar') as HTMLElement;
    return {
      innerW: window.innerWidth,
      innerH: window.innerHeight,
      scrollOverflowX: document.documentElement.scrollWidth - window.innerWidth,
      scrollOverflowY: document.documentElement.scrollHeight - window.innerHeight,
      canvas: { x: r.x, y: r.y, w: r.width, h: r.height },
      canvasPx: { w: canvas.width, h: canvas.height },
      topbarOverflow: top.scrollWidth - top.clientWidth,
    };
  });
}

const SIZES = [
  [1280, 720],
  [1920, 1080],
  [2560, 1440],
] as const;
const DPRS = [1, 1.25, 1.5] as const;

for (const [w, h] of SIZES) {
  for (const dpr of DPRS) {
    test(`CA-80: ${w}x${h} at DPR ${dpr}: canvas fills its box in device pixels, integer scale, no scrollbars, no console errors`, async ({
      browser,
    }) => {
      const context = await browser.newContext({
        viewport: { width: w, height: h },
        deviceScaleFactor: dpr,
      });
      const page = await context.newPage();
      const log = watchConsole(page);
      try {
        await openReal(office, page, '?debug&demo=6');
        await page.waitForTimeout(500);
        const l = await layout(page);
        const m = await metrics(page);
        expect(l.scrollOverflowX).toBeLessThanOrEqual(0);
        expect(l.scrollOverflowY).toBeLessThanOrEqual(0);
        expect(l.topbarOverflow).toBeLessThanOrEqual(1);
        expect(l.canvas.w).toBeGreaterThan(w * 0.5);
        expect(l.canvas.x + l.canvas.w).toBeLessThanOrEqual(w + 1);
        expect(l.canvas.y + l.canvas.h).toBeLessThanOrEqual(h + 1);
        // Backing store = CSS box x DPR (within rounding): no blurry stretching.
        expect(Math.abs(l.canvasPx.w - Math.round(l.canvas.w * dpr))).toBeLessThanOrEqual(2);
        expect(Math.abs(l.canvasPx.h - Math.round(l.canvas.h * dpr))).toBeLessThanOrEqual(2);
        expect(Number.isInteger(m.scale)).toBe(true);
        expect(m.dpr).toBe(dpr);
        expect(log.errors).toEqual([]);
      } finally {
        await context.close();
      }
    });
  }
}

test('CA-80: resizing the window 2560x1440 -> 1280x720 -> 800x600 -> 390x844 -> 1920x1080 while NPCs walk keeps rendering with no errors and no overflow', async ({
  page,
}) => {
  const log = watchConsole(page);
  await page.setViewportSize({ width: 2560, height: 1440 });
  await openReal(office, page, '?debug&demo=10');
  for (const [w, h] of [
    [1280, 720],
    [800, 600],
    [390, 844],
    [1920, 1080],
    [1024, 400],
    [2560, 1440],
  ] as const) {
    await page.setViewportSize({ width: w, height: h });
    const before = (await metrics(page)).rendered;
    await page.waitForTimeout(700);
    const m = await metrics(page);
    expect(m.rendered, `${w}x${h} keeps painting`).toBeGreaterThan(before);
    const l = await layout(page);
    expect(l.canvas.w, `${w}x${h} canvas width`).toBeLessThanOrEqual(w + 1);
    expect(l.scrollOverflowX, `${w}x${h} horizontal scroll`).toBeLessThanOrEqual(0);
    expect(Math.abs(l.canvasPx.w - Math.round(l.canvas.w))).toBeLessThanOrEqual(2);
  }
  expect(log.errors).toEqual([]);
});

test('CA-80: zoom and pan to the extremes (80 wheel ticks, +/- 30 times, 5000 px drags) never leave the map off screen and the zoom stays 2x..4x', async ({
  page,
}) => {
  const log = watchConsole(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await openReal(office, page, '?debug&demo=8');
  const canvas = page.getByTestId('office-canvas');
  const box = (await canvas.boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  const mapIsOnScreen = async () =>
    page.evaluate(() => {
      const dbg = (window as Dbg).__officeDebug!;
      const c = document.querySelector('[data-testid="office-canvas"]')!.getBoundingClientRect();
      // Any of the 4 map corners / centre inside the canvas box means some of the map is visible,
      // or the map covers the whole canvas (corners outside on both sides).
      const pts = [
        [0, 0],
        [64, 0],
        [0, 52],
        [64, 52],
        [32, 26],
      ].map(([x, y]) => dbg.engine.tileToCss(x!, y!));
      const inside = pts.some(
        (p) => p && p.x + c.left >= c.left && p.x <= c.width && p.y >= 0 && p.y <= c.height,
      );
      const covers =
        pts[0]!.x <= 0 && pts[3]!.x >= c.width && pts[0]!.y <= 0 && pts[3]!.y >= c.height;
      return { inside, covers, zoom: dbg.metrics().zoom };
    });

  for (let i = 0; i < 80; i++) {
    await page.mouse.move(cx + (i % 7) * 30 - 90, cy + (i % 5) * 20 - 40);
    await page.mouse.wheel(0, i % 3 === 0 ? 400 : -400);
  }
  let s = await mapIsOnScreen();
  expect([2, 3, 4]).toContain(s.zoom);
  expect(s.inside || s.covers).toBe(true);

  for (const [dx, dy] of [
    [5000, 3000],
    [-9000, -9000],
    [0, 8000],
    [-8000, 0],
  ] as const) {
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + dx, cy + dy, { steps: 4 });
    await page.mouse.up();
    s = await mapIsOnScreen();
    expect(s.inside || s.covers, `after drag ${dx},${dy}`).toBe(true);
  }

  await canvas.focus();
  for (let i = 0; i < 30; i++) await page.keyboard.press(i % 2 ? '-' : '+');
  for (let i = 0; i < 40; i++) await page.keyboard.press(['ArrowLeft', 'ArrowUp'][i % 2]!);
  s = await mapIsOnScreen();
  expect([2, 3, 4]).toContain(s.zoom);
  expect(s.inside || s.covers).toBe(true);
  expect(log.errors).toEqual([]);
});

test('CA-80: odd URL parameters (zoom=99, demo=999999, seed=abc, debugTime=garbage, quality=x) never break the page', async ({
  page,
}) => {
  const log = watchConsole(page);
  await openReal(
    office,
    page,
    '?debug&zoom=99&demo=999999&seed=abc&debugTime=garbage&quality=x&rain=maybe&dirty=2',
  );
  await page.waitForTimeout(1500);
  const rows = await npcRows(page);
  // Demo walkers are capped (MAX_DEMO = 64): 16 team + at most 64 walkers.
  expect(rows.length).toBeLessThanOrEqual(16 + 64);
  expect((await metrics(page)).rendered).toBeGreaterThan(3);
  expect(log.errors).toEqual([]);
});

test('CA-22: with prefers-reduced-motion there is no running infinite CSS animation anywhere on the page and the clock/frames still work', async ({
  browser,
}) => {
  const context = await browser.newContext({
    reducedMotion: 'reduce',
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();
  const log = watchConsole(page);
  try {
    await openReal(office, page);
    await office.hook(startHook('dev-web', 'agent-rm-1'));
    await office.hook(startHook('desconhecido-rm', 'agent-rm-2'));
    await page.getByRole('button', { name: 'Equipe' }).click();
    await page.waitForTimeout(800);
    const infinite = await page.evaluate(() =>
      document
        .getAnimations()
        .filter((a) => {
          const t = a.effect?.getComputedTiming();
          return (
            t &&
            (t.iterations === Infinity || (t.duration as number) > 0) &&
            a.playState === 'running'
          );
        })
        .map((a) => a.id || (a as CSSAnimation).animationName || a.constructor.name),
    );
    expect(infinite).toEqual([]);
    // The status still reads as text (not only motion).
    await expect(page.locator('button[data-npc="dev-web"]')).toContainText('Trabalhando');
    expect(log.errors).toEqual([]);
    await office.hook(stopHook('dev-web', 'agent-rm-1'));
    await office.hook(stopHook('desconhecido-rm', 'agent-rm-2'));
  } finally {
    await context.close();
  }
});

test('CA-07: hooks that arrive while the tab is hidden are applied on return: the NPC is working at once, nobody teleports across the map', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openReal(office, page, '?debug&zoom=2');
  const hide = (hidden: boolean) =>
    page.evaluate((h) => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => (h ? 'hidden' : 'visible'),
      });
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
      document.dispatchEvent(new Event('visibilitychange'));
    }, hidden);
  await hide(true);
  const framesBefore = (await metrics(page)).rendered;
  expect(await office.hook(startHook('dev-qa-hidden', 'agent-hid-1'))).toBe(204);
  expect(await office.hook(startHook('dev-web', 'agent-hid-2'))).toBe(204);
  await page.waitForTimeout(2500);
  const hiddenMetrics = await metrics(page);
  expect(hiddenMetrics.rendered).toBe(framesBefore);
  expect(hiddenMetrics.renderedWhileHidden).toBe(0);
  await hide(false);
  await expect
    .poll(async () => (await npcRows(page)).find((r) => r.key === 'dev-web')?.mode, {
      timeout: 1500,
    })
    .toBe('working');
  await expect(page.getByText('Agentes 1/16')).toBeVisible();
  // The freelancer announced while hidden walks in from the Reception rather than appearing at the desk.
  const freelancer = (await npcRows(page)).find((r) => r.key.startsWith('freelancer:'));
  expect(freelancer?.mode).toMatch(/arriving|working/);
  await office.hook(stopHook('dev-web', 'agent-hid-2'));
  await office.hook(stopHook('dev-qa-hidden', 'agent-hid-1'));
});

test('CA-15: a burst of 1000 hook events keeps the page responsive, <= 30 fps, no errors, and every NPC ends idle after the stops', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const log = watchConsole(page);
  await openReal(office, page, '?debug&zoom=2');
  const types = FIXED_TYPES.slice(1);
  const events: Record<string, unknown>[] = [];
  types.forEach((t) => events.push(startHook(t, `agent-burst-${t}`)));
  for (let i = 0; events.length < 985; i++) {
    const t = types[i % types.length]!;
    events.push({
      hook_event_name: i % 2 ? 'PreToolUse' : 'PostToolUse',
      session_id: 'burst-session',
      cwd: 'C:\\dev\\Burst',
      agent_id: `agent-burst-${t}`,
      agent_type: t,
      tool_name: ['Edit', 'Read', 'Bash', 'Grep'][i % 4],
      tool_use_id: `toolu_${i}`,
    });
  }
  types.forEach((t) => events.push(stopHook(t, `agent-burst-${t}`)));
  const t0 = Date.now();
  const statuses: number[] = [];
  for (let i = 0; i < events.length; i += 50) {
    statuses.push(...(await Promise.all(events.slice(i, i + 50).map((e) => office.hook(e)))));
  }
  const postMs = Date.now() - t0;
  expect(statuses.every((s) => s === 204)).toBe(true);
  // The page must answer a round trip quickly right after the flood (main thread not starved).
  const rtt0 = Date.now();
  await page.evaluate(() => 1);
  expect(Date.now() - rtt0).toBeLessThan(1500);
  await expect(page.getByText('Agentes 0/16')).toBeVisible({ timeout: 10_000 });
  const stamps = await page.evaluate(() => (window as Dbg).__officeDebug!.frameTimestamps());
  let worst = 0;
  for (let i = 0, j = 0; i < stamps.length; i++) {
    while ((stamps[i] as number) - (stamps[j] as number) >= 1000) j++;
    worst = Math.max(worst, i - j + 1);
  }
  expect(worst).toBeLessThanOrEqual(30);
  const rows = await npcRows(page);
  await expect
    .poll(async () => (await npcRows(page)).filter((r) => r.mode === 'working').length, {
      timeout: 15_000,
    })
    .toBe(0);
  expect(rows.length).toBe(16);
  // The server side stayed healthy too.
  const diag = JSON.parse((await office.get('/api/diag')).body) as {
    counters: Record<string, number>;
  };
  expect(diag.counters['office.liveInstances']).toBe(0);
  expect(postMs).toBeLessThan(60_000);
  expect(log.errors).toEqual([]);
  expect(log.notFound.filter((u) => !OPTIONAL_ASSETS.some((a) => u.startsWith(a)))).toEqual([]);
});

test('M-05 / CA-15: hook POST -> NPC "working" in the page, 50 samples: p95 <= 1 s and max <= 2 s', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await openReal(office, page, '?debug&zoom=2');
  // In-page poller: records the epoch ms at which each NPC is first seen "working".
  await page.evaluate(() => {
    const w = window as Dbg & { __seen?: Record<string, number> };
    w.__seen = {};
    setInterval(() => {
      for (const r of w.__officeDebug!.npcs())
        if (r.mode === 'working' && w.__seen![r.key] === undefined) w.__seen![r.key] = Date.now();
    }, 4);
  });
  const types = FIXED_TYPES.slice(1);
  const latencies: number[] = [];
  for (let i = 0; i < 50; i++) {
    const type = types[i % types.length]!;
    const id = `agent-lat-${i}`;
    await page.evaluate((k) => {
      delete (window as Dbg & { __seen?: Record<string, number> }).__seen![k];
    }, type);
    const t0 = Date.now();
    expect(await office.hook(startHook(type, id))).toBe(204);
    await expect
      .poll(
        () =>
          page.evaluate(
            (k) => (window as Dbg & { __seen?: Record<string, number> }).__seen![k] ?? 0,
            type,
          ),
        { timeout: 3000, intervals: [10] },
      )
      .toBeGreaterThan(0);
    const seen = await page.evaluate(
      (k) => (window as Dbg & { __seen?: Record<string, number> }).__seen![k]!,
      type,
    );
    latencies.push(seen - t0);
    await office.hook(stopHook(type, id));
    await page.waitForTimeout(120);
  }
  latencies.sort((a, b) => a - b);
  const p95 = latencies[Math.floor(latencies.length * 0.95) - 1]!;
  console.log(
    `M-05 latency ms: min ${latencies[0]} p50 ${latencies[25]} p95 ${p95} max ${latencies[49]}`,
  );
  expect(p95).toBeLessThanOrEqual(1000);
  expect(latencies[49]).toBeLessThanOrEqual(2000);
});

test('CA-06: 60 simultaneous Freelancers (a runaway agent factory) still render at <= 30 fps and the page stays responsive', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const log = watchConsole(page);
  await openReal(office, page, '?debug&zoom=2');
  for (let i = 0; i < 60; i++) await office.hook(startHook(`fabrica-${i}`, `agent-fab-${i}`));
  await expect
    .poll(async () => (await npcRows(page)).filter((r) => r.key.startsWith('freelancer:')).length, {
      timeout: 5000,
    })
    .toBeGreaterThanOrEqual(10); // the map has a limited number of visitor seats (OBS-03: the rest are not drawn)
  await page.waitForTimeout(8000);
  const stamps = await page.evaluate(() => (window as Dbg).__officeDebug!.frameTimestamps());
  const recent = stamps.filter((t) => t > stamps[stamps.length - 1]! - 8000);
  let worst = 0;
  for (let i = 0, j = 0; i < recent.length; i++) {
    while ((recent[i] as number) - (recent[j] as number) >= 1000) j++;
    worst = Math.max(worst, i - j + 1);
  }
  expect(worst).toBeLessThanOrEqual(30);
  const rtt0 = Date.now();
  await page.getByRole('button', { name: 'Equipe' }).click();
  await expect(page.getByTestId('team-drawer')).toBeVisible();
  expect(Date.now() - rtt0).toBeLessThan(2000);
  for (let i = 0; i < 60; i++) await office.hook(stopHook(`fabrica-${i}`, `agent-fab-${i}`));
  expect(log.errors).toEqual([]);
});
