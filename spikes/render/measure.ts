// S-02 (reduced): measures the Canvas 2D engine in the real scene (64x52 floor, ~20 walking sprites
// with A*, 4 lit rooms + night ambient, 1080p, zoom 3x) on Edge. Run: `npx tsx spikes/render/measure.ts`
// Env: S02_SECONDS (per scenario, default 60), S02_HEADED=1 (visible window: realistic GPU numbers).
//
// CPU comes from CDP `SystemInfo.getProcessInfo` (cumulative CPU seconds per browser process):
// CPU% of one core = delta CPU seconds / delta wall seconds.

import { writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Page } from '@playwright/test';
import { buildWeb, startAppServer } from '../../tests/e2e/helpers/appServer';
import { mockSocket } from '../../tests/e2e/helpers/mockSocket';

const SECONDS = Number(process.env.S02_SECONDS ?? 60);
const HEADED = process.env.S02_HEADED === '1';
// Extra query string for A/B runs, e.g. S02_EXTRA='&dirty=0'.
const EXTRA = process.env.S02_EXTRA ?? '';
const ONLY = process.env.S02_ONLY?.split(',');
const want = (k: string) => !ONLY || ONLY.includes(k);
const OUT = process.env.S02_OUT ?? join(process.cwd(), 'test-results', 's02-results.json');

type Dbg = {
  metrics: () => {
    rendered: number;
    renderedWhileHidden: number;
    frameMsP50: number;
    frameMsP95: number;
    quality: string;
    scale: number;
    dpr: number;
  };
  frameTimestamps: () => number[];
  crispness: () => { worldColors: number; presentedColors: number; foreign: number };
};
type W = Window & { __officeDebug?: Dbg };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function setHidden(page: Page, hidden: boolean) {
  // String script: tsx injects a __name helper into function bodies, which does not exist in the page.
  await page.evaluate(`(() => { const h = ${hidden}; Object.defineProperty(document, "visibilityState", { configurable: true, get() { return h ? "hidden" : "visible"; } }); Object.defineProperty(document, "hidden", { configurable: true, get() { return h; } }); document.dispatchEvent(new Event("visibilitychange")); })()`);
}

async function main() {
  const dist = join(process.cwd(), 'test-results', 's02-dist');
  await buildWeb(dist);
  const server = await startAppServer(dist);

  // R6: bundle size (gzip) of everything Vite emitted; the renderer itself has no dependency.
  const bundleDir = join(dist, 'bundle');
  const bundle = readdirSync(bundleDir)
    .filter((f) => f.endsWith('.js') || f.endsWith('.css'))
    .map((f) => ({ file: f, bytes: readFileSync(join(bundleDir, f)).length, gzip: gzipSync(readFileSync(join(bundleDir, f))).length }));

  const browser = await chromium.launch({
    channel: 'msedge',
    headless: !HEADED,
    args: HEADED ? [] : ['--headless=new'],
  });
  const version = browser.version();
  const browserCdp = await browser.newBrowserCDPSession();

  const gpuInfo = (await browserCdp.send('SystemInfo.getInfo').catch(() => null)) as null | {
    gpu?: { devices?: { vendorString?: string; deviceString?: string }[]; featureStatus?: Record<string, string> };
  };

  const cpuByType = async (): Promise<Record<string, number>> => {
    const { processInfo } = (await browserCdp.send('SystemInfo.getProcessInfo')) as {
      processInfo: { type: string; cpuTime: number }[];
    };
    const out: Record<string, number> = {};
    for (const p of processInfo) out[p.type.toLowerCase()] = (out[p.type.toLowerCase()] ?? 0) + p.cpuTime;
    return out;
  };

  async function runScenario(name: string, query: string, options: { hidden?: boolean; dpr?: number; seconds?: number } = {}) {
    const seconds = options.seconds ?? SECONDS;
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: options.dpr ?? 1,
    });
    const page = await context.newPage();
    await mockSocket(page);
    await page.goto(`${server.url}/${query}${EXTRA}`);
    await page.waitForFunction(() => ((window as W).__officeDebug?.metrics().rendered ?? 0) > 5, undefined, { timeout: 30_000 });
    if (options.hidden) await setHidden(page, true);
    await sleep(4_000); // warm-up: GPU process start, JIT, first sprite sheets

    const t0 = await page.evaluate(() => performance.now());
    const before = await cpuByType();
    const wall0 = Date.now();
    const renderedBefore = await page.evaluate(() => (window as W).__officeDebug!.metrics().rendered);
    await sleep(seconds * 1000);
    const wall = (Date.now() - wall0) / 1000;
    const after = await cpuByType();
    const t1 = await page.evaluate(() => performance.now());
    const m = await page.evaluate(() => (window as W).__officeDebug!.metrics());
    const stamps = (await page.evaluate(() => (window as W).__officeDebug!.frameTimestamps())).filter((t) => t >= t0 && t <= t1);

    let worstWindow = 0;
    for (let i = 0, j = 0; i < stamps.length; i++) {
      while ((stamps[i] as number) - (stamps[j] as number) >= 1000) j++;
      worstWindow = Math.max(worstWindow, i - j + 1);
    }
    const cpu: Record<string, number> = {};
    for (const type of Object.keys(after)) cpu[type] = (((after[type] ?? 0) - (before[type] ?? 0)) / wall) * 100;
    const renderer = cpu.renderer ?? 0;
    const gpu = cpu.gpu ?? 0;
    const result = {
      name,
      query,
      seconds: Math.round(wall),
      dpr: options.dpr ?? 1,
      framesRendered: m.rendered - renderedBefore,
      avgFps: stamps.length / wall,
      maxFramesInAny1sWindow: worstWindow,
      frameMsP50: m.frameMsP50,
      frameMsP95: m.frameMsP95,
      quality: m.quality,
      renderedWhileHidden: m.renderedWhileHidden,
      cpuPercentOfOneCore: { renderer, gpu, browser: cpu.browser ?? 0, rendererPlusGpu: renderer + gpu, all: Object.values(cpu).reduce((a, b) => a + b, 0), byType: cpu },
    };
    await context.close();
    return result;
  }

  const results: Record<string, unknown> = { edge: version, headed: HEADED, secondsPerScenario: SECONDS, gpu: gpuInfo?.gpu?.featureStatus, gpuDevices: gpuInfo?.gpu?.devices, bundle };
  const night = 'debugTime=2026-12-24T21:00:00-03:00';

  if (want('A')) results.A_idle = await runScenario('A idle (ambient only, day)', '?debug&zoom=3');
  if (want('B')) results.B_working = await runScenario('B 20 NPCs walking (A*), day', '?debug&demo=20&zoom=3');
  if (want('C')) results.C_worst = await runScenario('C worst case: 20 NPCs + rain + night + 4 rooms', `?debug&demo=20&zoom=3&rain=1&${night}`);
  if (want('D')) results.D_hidden = await runScenario('D hidden tab (20 NPCs, rain, night)', `?debug&demo=20&zoom=3&rain=1&${night}`, { hidden: true });

  // R7: resume after hidden.
  if (want('R7')) {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const page = await context.newPage();
    await mockSocket(page);
    await page.goto(`${server.url}/?debug&demo=20&zoom=3`);
    await page.waitForFunction(() => ((window as W).__officeDebug?.metrics().rendered ?? 0) > 5);
    const samples: number[] = [];
    for (let i = 0; i < 10; i++) {
      await setHidden(page, true);
      await sleep(1500);
      samples.push(
        (await page.evaluate(`(async () => { const dbg = window.__officeDebug; const start = dbg.metrics().rendered; Object.defineProperty(document, "visibilityState", { configurable: true, get() { return "visible"; } }); Object.defineProperty(document, "hidden", { configurable: true, get() { return false; } }); const t0 = performance.now(); document.dispatchEvent(new Event("visibilitychange")); while (dbg.metrics().rendered === start) { if (performance.now() - t0 > 3000) return 99999; await new Promise((r) => setTimeout(r, 2)); } return performance.now() - t0; })()`)) as number,
      );
      await sleep(500);
    }
    results.R7_resumeMs = { samples, max: Math.max(...samples) };
    await context.close();
  }

  // R4: crispness at DPR 1 / 1.25 / 1.5, zoom 3.
  const crisp: unknown[] = [];
  for (const dpr of want('R4') ? [1, 1.25, 1.5] : []) {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: dpr });
    const page = await context.newPage();
    await mockSocket(page);
    await page.goto(`${server.url}/?debug&demo=20&zoom=3`);
    await page.waitForFunction(() => ((window as W).__officeDebug?.metrics().rendered ?? 0) > 5);
    await sleep(800);
    crisp.push({ dpr, ...(await page.evaluate(() => ({ ...(window as W).__officeDebug!.crispness(), scale: (window as W).__officeDebug!.metrics().scale }))) });
    await context.close();
  }
  results.R4_crispness = crisp;

  writeFileSync(OUT, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
  await browser.close();
  await server.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
