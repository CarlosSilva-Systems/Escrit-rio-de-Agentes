import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { buildWeb } from '../helpers/appServer';
import {
  FIXED_TYPES,
  openReal,
  npcRows,
  startHook,
  startRestartableOffice,
  stopHook,
  watchConsole,
  type RestartableOffice,
} from './helpers';

// T-33: heap / DOM / listener growth of the page (and heap of the in-process server) over ~3 minutes
// with the 16 NPCs working (they move around), hooks flowing, Freelancers coming and going and the panels opening/closing.
// `QA_MEM_SECONDS` shortens/extends the run (default 180).

const SECONDS = Number(process.env['QA_MEM_SECONDS'] ?? 180);

let office: RestartableOffice;
test.beforeAll(async () => {
  const dist = join(process.cwd(), 'test-results', 'web-dist-fase1-memory');
  await buildWeb(dist);
  office = await startRestartableOffice(dist);
});
test.afterAll(async () => {
  await office.cleanup();
});

interface Sample {
  t: number;
  pageHeapMb: number;
  nodes: number;
  listeners: number;
  serverHeapMb: number;
  serverRssMb: number;
  clients: number;
}

test(`M-04: ${SECONDS} s with 16 NPCs working + Freelancers (~20 on the map), hooks and panels: page heap, DOM nodes and listeners stay flat; server heap too`, async ({
  page,
}) => {
  test.setTimeout((SECONDS + 240) * 1000);
  const log = watchConsole(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await openReal(office, page, '?debug&zoom=2');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  await cdp.send('HeapProfiler.enable');

  const sample = async (t: number): Promise<Sample> => {
    await cdp.send('HeapProfiler.collectGarbage');
    const perf = (await cdp.send('Performance.getMetrics')) as {
      metrics: { name: string; value: number }[];
    };
    const m = (n: string) => perf.metrics.find((x) => x.name === n)?.value ?? 0;
    const dom = (await cdp.send('Memory.getDOMCounters')) as {
      nodes: number;
      jsEventListeners: number;
    };
    global.gc?.();
    const mem = process.memoryUsage();
    return {
      t,
      pageHeapMb: m('JSHeapUsedSize') / 1048576,
      nodes: dom.nodes,
      listeners: dom.jsEventListeners,
      serverHeapMb: mem.heapUsed / 1048576,
      serverRss: mem.rss,
      serverRssMb: mem.rss / 1048576,
      clients: office.clients(),
    } as Sample;
  };

  // 16 fixed NPCs working the whole time + a rotating crowd of Freelancers (up to ~20 on the map).
  for (const type of FIXED_TYPES) await office.hook(startHook(type, `agent-mem-base-${type}`));
  await expect(page.getByText('Agentes 16/16')).toBeVisible({ timeout: 5000 });

  const samples: Sample[] = [];
  const start = Date.now();
  samples.push(await sample(0));
  let round = 0;
  let nextSample = 20;
  while ((Date.now() - start) / 1000 < SECONDS) {
    round++;
    const type = FIXED_TYPES[round % FIXED_TYPES.length]!;
    const id = `agent-mem-base-${type}`;
    await office.hook(startHook(`visitante-${round % 3}`, `agent-mem-fl-${round}`));
    for (let k = 0; k < 6; k++) {
      await office.hook({
        hook_event_name: k % 2 ? 'PostToolUse' : 'PreToolUse',
        session_id: 'mem-session',
        cwd: 'C:\\dev\\Mem',
        agent_id: id,
        agent_type: type,
        tool_name: 'Edit',
        tool_use_id: `toolu_mem_${round}_${k}`,
      });
    }
    if (round % 4 === 0) {
      // Open / close the HUD pieces that mount and unmount React trees.
      await page.getByRole('button', { name: 'Equipe' }).click();
      await page.locator(`button[data-npc="${type}"]`).click();
      await page.waitForTimeout(150);
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      if (await page.getByTestId('team-drawer').count())
        await page.getByRole('button', { name: 'Fechar' }).first().click();
    }
    await page.waitForTimeout(1200);
    // Freelancers leave after ~8 s (a few are on the map at any time).
    if (round > 4)
      await office.hook(stopHook(`visitante-${(round - 4) % 3}`, `agent-mem-fl-${round - 4}`));
    await page.waitForTimeout(800);
    if ((Date.now() - start) / 1000 >= nextSample) {
      samples.push(await sample(Math.round((Date.now() - start) / 1000)));
      nextSample += 20;
    }
  }
  for (let r = Math.max(1, round - 3); r <= round; r++)
    await office.hook(stopHook(`visitante-${r % 3}`, `agent-mem-fl-${r}`));
  // Freelancers walk out at walking speed: give them time, then nobody may be left (no ghosts).
  await expect
    .poll(async () => (await npcRows(page)).filter((r) => r.key.startsWith('freelancer:')).length, {
      timeout: 120_000,
      intervals: [1000],
    })
    .toBe(0);
  await page.waitForTimeout(2000);
  samples.push(await sample(Math.round((Date.now() - start) / 1000)));

  console.log('t(s)  pageHeapMB  nodes  listeners  serverHeapMB  serverRssMB  wsClients');
  for (const s of samples)
    console.log(
      `${String(s.t).padStart(4)}  ${s.pageHeapMb.toFixed(1).padStart(9)}  ${String(s.nodes).padStart(5)}  ${String(s.listeners).padStart(9)}  ${s.serverHeapMb.toFixed(1).padStart(12)}  ${s.serverRssMb.toFixed(1).padStart(11)}  ${s.clients}`,
    );

  // Compare the second sample (after warm-up: JIT, atlas, first panels) with the last one.
  const warm = samples[Math.min(2, samples.length - 2)]!;
  const last = samples[samples.length - 1]!;
  expect(last.pageHeapMb - warm.pageHeapMb, 'page heap growth (MB) after warm-up').toBeLessThan(8);
  expect(last.nodes - warm.nodes, 'DOM node growth').toBeLessThan(150);
  expect(last.listeners - warm.listeners, 'event listener growth').toBeLessThan(60);
  expect(last.serverHeapMb - warm.serverHeapMb, 'server heap growth (MB)').toBeLessThan(25);
  expect(last.clients).toBe(1);
  for (const type of FIXED_TYPES) await office.hook(stopHook(type, `agent-mem-base-${type}`));
  expect(log.errors).toEqual([]);
});
