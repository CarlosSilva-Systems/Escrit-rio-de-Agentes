/* global window */
// Phase 1 measurements (T-33, M-01..M-05): server start-up time, idle server CPU / memory, bundle
// size, browser CPU for several scenarios (visible / hidden, idle / 5 working / 5 walking / worst
// case) and the hook -> NPC latency.
//
//   node scripts/perf/measure-fase1.mjs [--seconds 60] [--out test-results/perf-fase1.json] [--only a,b]
//
// Everything runs on temporary homes and a TEST server on a random loopback port (never the real
// server on 3200, never ~/.claude). The browser is Edge headless; CPU comes from CDP
// `SystemInfo.getProcessInfo` (cumulative CPU seconds per browser process): % of ONE core =
// delta CPU / delta wall time. A hidden tab is simulated by overriding `visibilityState`.
// Server CPU / memory come from PowerShell `Get-Process` (Windows).

import { spawn, spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { chromium } from '@playwright/test';
import { build as viteBuild } from 'vite';
import { buildServer } from '../build-server.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const SECONDS = Number(opt('seconds', '60'));
const OUT = opt('out', join(ROOT, 'test-results', 'perf-fase1.json'));
const ONLY = opt('only', '').split(',').filter(Boolean);
const want = (k) => ONLY.length === 0 || ONLY.includes(k);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

const freePort = () =>
  new Promise((resolve, reject) => {
    const s = createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });

const results = {
  node: process.version,
  secondsPerScenario: SECONDS,
  startedAt: new Date().toISOString(),
};

// ---------------------------------------------------------------------------------------------
// Build (same two steps as `npm run build`, server output in a temp dir)
// ---------------------------------------------------------------------------------------------
const tmpRoot = mkdtempSync(join(tmpdir(), 'perf-fase1-'));
const serverOut = join(ROOT, 'test-results', 'perf-dist');
const tBuild = Date.now();
await viteBuild({ configFile: join(ROOT, 'vite.config.ts'), logLevel: 'silent' });
await buildServer({ outdir: serverOut });
results.buildMs = Date.now() - tBuild;

// M: bundle size (everything Vite emitted into dist/web)
{
  const files = [];
  const walk = (d) => {
    for (const name of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, name.name);
      if (name.isDirectory()) walk(p);
      else files.push(p);
    }
  };
  walk(join(ROOT, 'dist', 'web'));
  const rows = files
    .filter((f) => /\.(js|css|html|json|woff2?|png)$/.test(f))
    .map((f) => {
      const buf = readFileSync(f);
      return {
        file: f.slice(join(ROOT, 'dist', 'web').length + 1).replaceAll('\\', '/'),
        bytes: buf.length,
        gzip: gzipSync(buf).length,
      };
    });
  const js = rows.filter((r) => r.file.endsWith('.js'));
  const css = rows.filter((r) => r.file.endsWith('.css'));
  results.bundle = {
    files: rows,
    jsBytes: js.reduce((a, r) => a + r.bytes, 0),
    jsGzip: js.reduce((a, r) => a + r.gzip, 0),
    cssGzip: css.reduce((a, r) => a + r.gzip, 0),
    totalGzip: rows.reduce((a, r) => a + r.gzip, 0),
    budgetGzipKb: 400,
  };
}

// ---------------------------------------------------------------------------------------------
// Test server (child process = the real built entry point, temp homes)
// ---------------------------------------------------------------------------------------------
function makeHomes() {
  const home = mkdtempSync(join(tmpRoot, 'home-'));
  const claudeHome = mkdtempSync(join(tmpRoot, 'claude-'));
  mkdirSync(join(claudeHome, 'projects'), { recursive: true });
  mkdirSync(join(claudeHome, 'equipe'), { recursive: true });
  cpSync(
    join(ROOT, 'tests', 'fixtures', 'team', 'QUADRO.sample.md'),
    join(claudeHome, 'equipe', 'QUADRO.md'),
  );
  return { home, claudeHome };
}

async function startServerProcess() {
  const { home, claudeHome } = makeHomes();
  const port = await freePort();
  const t0 = Date.now();
  const child = spawn(process.execPath, [join(serverOut, 'server', 'index.js')], {
    cwd: ROOT,
    shell: false,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      ESCRITORIO_PORT: String(port),
      ESCRITORIO_HOME: home,
      ESCRITORIO_DEV_ROOT: home,
      ESCRITORIO_CLAUDE_HOME: claudeHome,
      ESCRITORIO_LOG_LEVEL: 'warn',
    },
  });
  let stdout = '';
  child.stdout.on('data', (c) => (stdout += c));
  child.stderr.on('data', (c) => (stdout += c));
  let startedLineMs = null;
  child.stdout.on('data', () => {
    if (startedLineMs === null && /\d{4}/.test(stdout)) startedLineMs = Date.now() - t0;
  });
  // First successful HTTP answer (any status) = ready.
  for (;;) {
    if (child.exitCode !== null) throw new Error(`server exited early: ${stdout}`);
    if (Date.now() - t0 > 30_000) throw new Error('server did not start in 30 s');
    try {
      await fetch(`http://127.0.0.1:${port}/api/health`);
      break;
    } catch {
      await sleep(15);
    }
  }
  const readyMs = Date.now() - t0;
  return {
    child,
    port,
    home,
    claudeHome,
    readyMs,
    startedLineMs,
    origin: `http://127.0.0.1:${port}`,
    stop: async () => {
      spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
      await sleep(300);
    },
  };
}

async function login(server) {
  const token = readFileSync(join(server.home, 'token'), 'utf8').trim();
  const t = await fetch(`${server.origin}/api/auth/ticket`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
  });
  const { ticket } = await t.json();
  const cb = await fetch(`${server.origin}/auth/callback?ticket=${ticket}`, { redirect: 'manual' });
  const cookie = (cb.headers.get('set-cookie') ?? '').split(';')[0];
  const [name, value] = cookie.split('=');
  const hookToken = readFileSync(join(server.home, 'hook-token'), 'utf8').trim();
  return {
    name,
    value,
    hook: (payload) =>
      fetch(`${server.origin}/api/hooks/v1/claude`, {
        method: 'POST',
        headers: { authorization: `Bearer ${hookToken}`, 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      }).then((r) => r.status),
  };
}

const sub = (type, id, event = 'SubagentStart') => ({
  hook_event_name: event,
  session_id: '3f1c2f9e-8a7b-4c1d-9b6e-2a5d7c8e9f10',
  cwd: 'C:\\dev\\Sites',
  agent_id: id,
  agent_type: type,
});
const TYPES = [
  'analista',
  'arquiteto',
  'designer-ux',
  'dev-web',
  'dev-backend',
  'dev-odoo',
  'dev-embarcados',
  'dev-automacao',
  'testador-qa',
  'revisor-codigo',
  'revisor-seguranca',
  'pentester',
  'git-github',
  'documentador',
  'pesquisador',
];

// ---------------------------------------------------------------------------------------------
// Server start-up time (cold start of the bundled entry point, 5 runs)
// ---------------------------------------------------------------------------------------------
if (want('startup')) {
  const ready = [];
  const line = [];
  for (let i = 0; i < 5; i++) {
    const s = await startServerProcess();
    ready.push(s.readyMs);
    if (s.startedLineMs !== null) line.push(s.startedLineMs);
    await s.stop();
  }
  results.serverStartup = {
    runsMs: ready,
    medianMs: median(ready),
    minMs: Math.min(...ready),
    maxMs: Math.max(...ready),
  };
}

// ---------------------------------------------------------------------------------------------
// Idle server CPU / memory (M-04) with one browser connected, 16 NPCs idle
// ---------------------------------------------------------------------------------------------
function sampleProcess(pid, seconds) {
  // One PowerShell loop: "<cpu seconds> <working set bytes>" per second.
  const script = `$p = Get-Process -Id ${pid}; 1..${seconds} | ForEach-Object { Start-Sleep -Seconds 1; $p.Refresh(); '{0} {1}' -f $p.TotalProcessorTime.TotalSeconds.ToString([cultureinfo]::InvariantCulture), $p.WorkingSet64 }`;
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8',
    windowsHide: true,
  });
  return r.stdout
    .trim()
    .split(/\r?\n/)
    .map((l) => l.split(' ').map(Number))
    .filter((p) => p.length === 2 && !Number.isNaN(p[0]));
}

const browser = await chromium.launch({
  channel: 'msedge',
  headless: true,
  args: ['--headless=new'],
});
results.edge = browser.version();
const cdp = await browser.newBrowserCDPSession();
const cpuByType = async () => {
  const { processInfo } = await cdp.send('SystemInfo.getProcessInfo');
  const out = {};
  for (const p of processInfo)
    out[p.type.toLowerCase()] = (out[p.type.toLowerCase()] ?? 0) + p.cpuTime;
  return out;
};

const setHidden = (page, hidden) =>
  page.evaluate(
    `(() => { const h = ${hidden}; Object.defineProperty(document, 'visibilityState', { configurable: true, get() { return h ? 'hidden' : 'visible'; } }); Object.defineProperty(document, 'hidden', { configurable: true, get() { return h; } }); document.dispatchEvent(new Event('visibilitychange')); })()`,
  );

async function openPage(server, session, query, { dpr = 1, width = 1920, height = 1080 } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr });
  await context.addCookies([{ name: session.name, value: session.value, url: server.origin }]);
  const page = await context.newPage();
  await page.goto(`${server.origin}/${query}`);
  await page.waitForFunction(() => (window.__officeDebug?.npcs().length ?? 0) >= 16, undefined, {
    timeout: 30_000,
  });
  return { context, page };
}

async function measureBrowser(
  name,
  server,
  session,
  query,
  { hidden = false, activity = null, seconds = SECONDS } = {},
) {
  const { context, page } = await openPage(server, session, query);
  if (activity) await activity.setup(page);
  if (hidden) await setHidden(page, true);
  await sleep(4000); // warm-up: GPU process, JIT, first frames
  const t0 = await page.evaluate(() => performance.now());
  const before = await cpuByType();
  const wall0 = Date.now();
  const frames0 = await page.evaluate(() => window.__officeDebug.metrics().rendered);
  let ticker = null;
  if (activity?.tick)
    ticker = setInterval(
      () => void activity.tick().catch(() => undefined),
      activity.everyMs ?? 1000,
    );
  await sleep(seconds * 1000);
  if (ticker) clearInterval(ticker);
  const wall = (Date.now() - wall0) / 1000;
  const after = await cpuByType();
  const t1 = await page.evaluate(() => performance.now());
  const m = await page.evaluate(() => window.__officeDebug.metrics());
  const stamps = (await page.evaluate(() => window.__officeDebug.frameTimestamps())).filter(
    (t) => t >= t0 && t <= t1,
  );
  let worst = 0;
  for (let i = 0, j = 0; i < stamps.length; i++) {
    while (stamps[i] - stamps[j] >= 1000) j++;
    worst = Math.max(worst, i - j + 1);
  }
  const cpu = {};
  for (const type of Object.keys(after))
    cpu[type] = (((after[type] ?? 0) - (before[type] ?? 0)) / wall) * 100;
  const heapMb = await page.evaluate(() =>
    performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null,
  );
  if (activity?.teardown) await activity.teardown(page);
  await context.close();
  const row = {
    name,
    query,
    hidden,
    seconds: Math.round(wall),
    framesRendered: m.rendered - frames0,
    avgFps: Number((stamps.length / wall).toFixed(1)),
    maxFramesInAny1sWindow: worst,
    renderedWhileHidden: m.renderedWhileHidden,
    frameMsP95: m.frameMsP95,
    quality: m.quality,
    jsHeapMb: heapMb === null ? null : Number(heapMb.toFixed(1)),
    cpuPctOfOneCore: {
      all: Number(
        Object.values(cpu)
          .reduce((a, b) => a + b, 0)
          .toFixed(2),
      ),
      renderer: Number((cpu.renderer ?? 0).toFixed(2)),
      gpu: Number((cpu.gpu ?? 0).toFixed(2)),
      browser: Number((cpu.browser ?? 0).toFixed(2)),
      rendererPlusGpu: Number(((cpu.renderer ?? 0) + (cpu.gpu ?? 0)).toFixed(2)),
    },
  };
  console.log(
    `${name}: all ${row.cpuPctOfOneCore.all}% (renderer ${row.cpuPctOfOneCore.renderer}% + gpu ${row.cpuPctOfOneCore.gpu}%), ${row.avgFps} fps, max ${worst}/s, hiddenFrames ${row.renderedWhileHidden}`,
  );
  return row;
}

const server = await startServerProcess();
const session = await login(server);
results.serverReadyMs = server.readyMs;

// Server idle: connect one browser (16 idle NPCs) and sample the server process.
if (want('server')) {
  const { context } = await openPage(server, session, '?debug');
  await sleep(3000);
  const samples = sampleProcess(server.child.pid, Math.max(15, Math.min(SECONDS, 120)));
  const first = samples[0];
  const last = samples[samples.length - 1];
  const cpuPct = ((last[0] - first[0]) / (samples.length - 1)) * 100;
  results.serverIdle = {
    seconds: samples.length - 1,
    cpuPctOfOneCore: Number(cpuPct.toFixed(2)),
    workingSetMbStart: Number((first[1] / 1048576).toFixed(1)),
    workingSetMbEnd: Number((last[1] / 1048576).toFixed(1)),
    growthMb: Number(((last[1] - first[1]) / 1048576).toFixed(1)),
  };
  console.log('server idle', JSON.stringify(results.serverIdle));
  await context.close();
}

// Browser scenarios on the REAL server (hooks are real HTTP posts).
const working5 = {
  setup: async () => {
    for (const t of TYPES.slice(0, 5)) await session.hook(sub(t, `perf-${t}`));
    await sleep(500);
  },
  teardown: async () => {
    for (const t of TYPES.slice(0, 5)) await session.hook(sub(t, `perf-${t}`, 'SubagentStop'));
  },
};
const churn = {
  ...working5,
  everyMs: 1000,
  tick: (() => {
    let n = 0;
    return async () => {
      n++;
      await session.hook({
        ...sub(TYPES[n % 5], `perf-${TYPES[n % 5]}`, 'PreToolUse'),
        tool_name: 'Edit',
        tool_use_id: `toolu_${n}`,
      });
    };
  })(),
};

const scenarios = {
  S1: ['S1 idle, visible (16 idle NPCs, zoom 3)', '?debug&zoom=3', {}],
  S2: ['S2 idle, hidden tab', '?debug&zoom=3', { hidden: true }],
  S3: [
    'S3 realistic: 5 NPCs working at their desks (hooks + tool events every 1 s), visible',
    '?debug&zoom=3',
    { activity: churn },
  ],
  S4: ['S4 realistic: 5 NPCs walking (demo walkers), visible', '?debug&demo=5&zoom=3', {}],
  S5: [
    'S5 5 NPCs working with activity, hidden tab',
    '?debug&zoom=3',
    { activity: churn, hidden: true },
  ],
  S8: ['S8 realistic: 2 NPCs walking (20 fps tier), visible', '?debug&demo=2&zoom=3', {}],
  S6: [
    'S6 worst case: 20 walking + rain + night, visible',
    '?debug&demo=20&zoom=3&rain=1&debugTime=2026-12-24T21:00:00-03:00',
    {},
  ],
  S7: [
    'S7 worst case, hidden tab',
    '?debug&demo=20&zoom=3&rain=1&debugTime=2026-12-24T21:00:00-03:00',
    { hidden: true },
  ],
};
results.browser = {};
for (const [key, [name, query, options]] of Object.entries(scenarios)) {
  if (want(key)) results.browser[key] = await measureBrowser(name, server, session, query, options);
}

// M-05: hook -> NPC latency, 50 samples, measured inside the page.
if (want('latency')) {
  const { context, page } = await openPage(server, session, '?debug&zoom=2');
  await page.evaluate(() => {
    window.__seen = {};
    setInterval(() => {
      for (const r of window.__officeDebug.npcs())
        if (r.mode === 'working' && window.__seen[r.key] === undefined)
          window.__seen[r.key] = Date.now();
    }, 4);
  });
  const lat = [];
  for (let i = 0; i < 50; i++) {
    const type = TYPES[i % TYPES.length];
    // The NPC must be idle before the sample (a leftover "working" would read as 0 ms).
    for (let w = 0; w < 100; w++) {
      const mode = await page.evaluate(
        (k) => window.__officeDebug.npcs().find((r) => r.key === k)?.mode,
        type,
      );
      if (mode !== 'working') break;
      await sleep(50);
    }
    await page.evaluate((k) => delete window.__seen[k], type);
    const t0 = Date.now();
    await session.hook(sub(type, `lat-${i}`));
    let seen = 0;
    while (!seen && Date.now() - t0 < 3000) {
      seen = await page.evaluate((k) => window.__seen[k] ?? 0, type);
      if (!seen) await sleep(8);
    }
    lat.push(seen ? seen - t0 : 3000);
    await session.hook(sub(type, `lat-${i}`, 'SubagentStop'));
    await sleep(150);
  }
  lat.sort((a, b) => a - b);
  results.hookToNpcLatencyMs = {
    samples: lat.length,
    min: lat[0],
    p50: lat[25],
    p95: lat[Math.floor(lat.length * 0.95) - 1],
    max: lat[lat.length - 1],
    targetP95: 1000,
    targetMax: 2000,
  };
  console.log('latency', JSON.stringify(results.hookToNpcLatencyMs));
  await context.close();
}

await browser.close();
await server.stop();
rmSync(tmpRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(results, null, 2));
console.log(`\nWritten ${OUT}`);
console.log(
  JSON.stringify(
    {
      serverStartup: results.serverStartup,
      serverIdle: results.serverIdle,
      bundle: {
        jsGzipKb: (results.bundle.jsGzip / 1024).toFixed(1),
        cssGzipKb: (results.bundle.cssGzip / 1024).toFixed(1),
        totalGzipKb: (results.bundle.totalGzip / 1024).toFixed(1),
      },
      hookToNpcLatencyMs: results.hookToNpcLatencyMs,
    },
    null,
    2,
  ),
);
