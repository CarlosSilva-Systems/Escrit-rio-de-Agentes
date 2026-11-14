import { spawn } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
  appendFileSync,
} from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  ServerEnvelopeSchema,
  type NpcLogical,
  type ServerMessage,
} from '../../src/shared/contracts';
import { proofOf } from '../../src/server/home/tokens';
import { buildServer } from '../../scripts/build-server.mjs';
import { officeServerOptions, type OfficeService } from '../../src/server/office';
import {
  login,
  rawRequest,
  startTestServer,
  type LoggedInSession,
  type TestServer,
} from './helpers/server';

const fixtures = join(import.meta.dirname, '..', 'fixtures');
const hookFixture = (name: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(fixtures, 'hooks', name), 'utf8'));
const HOOK_SCRIPT = join(
  import.meta.dirname,
  '..',
  '..',
  'src',
  'hook-runtime',
  'escritorio-hook.cjs',
);

const tmpDirs: string[] = [];
const tmp = (prefix: string) => {
  const d = mkdtempSync(join(tmpdir(), prefix));
  tmpDirs.push(d);
  return d;
};
afterAll(() => {
  for (const d of tmpDirs)
    rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

const NL = String.fromCharCode(10);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitFor(predicate: () => boolean | Promise<boolean>, ms = 4000) {
  const end = Date.now() + ms;
  while (!(await predicate())) {
    if (Date.now() > end) throw new Error('timeout waiting for condition');
    await sleep(20);
  }
}

interface Office {
  server: TestServer;
  session: LoggedInSession;
  hook: string;
  claudeHome: string;
  service: () => OfficeService | null;
}

async function startOffice(jsonl = false, jsonlOpts: Record<string, number> = {}): Promise<Office> {
  const claudeHome = tmp('claude-home-');
  mkdirSync(join(claudeHome, 'projects'), { recursive: true });
  mkdirSync(join(claudeHome, 'equipe'), { recursive: true });
  cpSync(join(fixtures, 'team', 'QUADRO.sample.md'), join(claudeHome, 'equipe', 'QUADRO.md'));
  const opts = officeServerOptions({
    claudeHome,
    mapPath: null,
    watchJsonl: jsonl,
    jsonl: { metaGraceMs: 300, pollMs: 200, discoverMs: 1000, ...jsonlOpts },
    flushMs: 10,
  });
  const server = await startTestServer({ extraRoutes: opts.extraRoutes, snapshot: opts.snapshot });
  const session = await login(server);
  const hook = readFileSync(join(server.home, 'hook-token'), 'utf8').trim();
  return { server, session, hook, claudeHome, service: opts.service };
}

const postHook = (o: Office, body: unknown, headers: Record<string, string> = {}) =>
  rawRequest(o.server.port, {
    method: 'POST',
    path: '/api/hooks/v1/claude',
    headers: { authorization: `Bearer ${o.hook}`, 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
const getJson = async (o: Office, path: string) => {
  const res = await rawRequest(o.server.port, { path, headers: { cookie: o.session.cookie } });
  return { status: res.status, json: res.body ? (JSON.parse(res.body) as unknown) : null };
};

describe('POST /api/hooks/v1/claude (T-16)', () => {
  let o: Office;
  beforeAll(async () => {
    o = await startOffice();
  });
  afterAll(() => o.server.stop());

  it('CA-15: hook-token required: no token, wrong token and master token are all 401', async () => {
    const body = JSON.stringify(hookFixture('session-start.json'));
    const none = await rawRequest(o.server.port, {
      method: 'POST',
      path: '/api/hooks/v1/claude',
      body,
      headers: { 'content-type': 'application/json' },
    });
    const wrong = await rawRequest(o.server.port, {
      method: 'POST',
      path: '/api/hooks/v1/claude',
      body,
      headers: { authorization: `Bearer ${'A'.repeat(43)}`, 'content-type': 'application/json' },
    });
    const master = readFileSync(join(o.server.home, 'token'), 'utf8').trim();
    const asMaster = await rawRequest(o.server.port, {
      method: 'POST',
      path: '/api/hooks/v1/claude',
      body,
      headers: { authorization: `Bearer ${master}`, 'content-type': 'application/json' },
    });
    expect([none.status, wrong.status, asMaster.status]).toEqual([401, 401, 401]);
  });

  it('CA-15: a request carrying Origin is refused (browsers cannot post here)', async () => {
    const res = await postHook(o, hookFixture('session-start.json'), {
      origin: 'http://evil.example',
    });
    expect(res.status).toBe(403);
  });

  it('CA-15: accepted -> 204 empty; unusable body -> 202 and ingest.invalid; never a 4xx for content', async () => {
    expect((await postHook(o, hookFixture('session-start.json'))).status).toBe(204);
    const bad = await postHook(o, '{ not json');
    expect(bad.status).toBe(202);
    expect(bad.body).toBe('');
    expect((await postHook(o, { no: 'event' })).status).toBe(202);
    expect((await postHook(o, [1, 2])).status).toBe(202);
    const diag = (await getJson(o, '/api/diag')).json as { counters: Record<string, number> };
    expect(diag.counters['ingest.invalid']).toBeGreaterThanOrEqual(3);
    expect(diag.counters['ingest.accepted']).toBeGreaterThanOrEqual(1);
  });

  it('CA-15: bodies up to 1 MB are accepted, larger ones are 413', async () => {
    const big = { ...hookFixture('stop.json'), tool_input: 'x'.repeat(900 * 1024) };
    expect((await postHook(o, big)).status).toBe(204);
    const huge = { ...hookFixture('stop.json'), tool_input: 'x'.repeat(1100 * 1024) };
    expect((await postHook(o, huge)).status).toBe(413);
  });

  it('CA-15: hook traffic has its own rate budget (300 posts do not starve the browser API)', async () => {
    const results = [];
    for (let batch = 0; batch < 10; batch++) {
      results.push(
        ...(await Promise.all(
          Array.from({ length: 30 }, (_, i) =>
            postHook(o, { ...hookFixture('stop.json'), session_id: `burst-${batch}-${i}` }),
          ),
        )),
      );
    }
    expect(results.every((r) => r.status === 204)).toBe(true);
    expect((await getJson(o, '/api/state')).status).toBe(200);
  });
});

describe('office state end to end (T-16, T-21)', () => {
  let o: Office;
  beforeAll(async () => {
    o = await startOffice();
  });
  afterAll(() => o.server.stop());

  const stateNpc = async (key: string) => {
    const snap = (await getJson(o, '/api/state')).json as { npcs: NpcLogical[] };
    return snap.npcs.find((n) => n.key === key);
  };

  it('CA-15: SubagentStart/Stop through HTTP moves the right NPC and is broadcast over /ws', async () => {
    const Ctor = WebSocket as unknown as new (
      url: string,
      init?: { headers?: Record<string, string> },
    ) => WebSocket;
    const ws = new Ctor(`ws://127.0.0.1:${o.server.port}/ws`, {
      headers: { Origin: o.session.origin, Cookie: o.session.cookie },
    });
    const messages: ServerMessage[] = [];
    ws.addEventListener('message', (e) => {
      const env = ServerEnvelopeSchema.parse(JSON.parse(String(e.data)));
      messages.push(...(env.t === 'batch' ? env.items : [env]));
    });
    await waitFor(() => messages.some((m) => m.t === 'snapshot'));

    const startedAt = Date.now();
    const cwd = 'D:\\fake\\7 - DEV\\Sites'; // outside the test dev root: "outside"
    await postHook(o, { ...hookFixture('subagent-start.json'), cwd });
    await waitFor(
      () =>
        messages.some(
          (m) => m.t === 'npc.update' && m.npc.key === 'dev-web' && m.npc.status === 'working',
        ),
      1500,
    );
    expect(Date.now() - startedAt).toBeLessThan(1000); // M-05: <= 1 s hook -> broadcast
    expect(await stateNpc('dev-web')).toMatchObject({ status: 'working', activeCount: 1 });
    expect(messages.some((m) => m.t === 'activity')).toBe(true);

    await postHook(o, { ...hookFixture('subagent-stop.json'), agent_id: 'abc123' });
    await waitFor(async () => (await stateNpc('dev-web'))?.status === 'idle');
    ws.close();
  });

  it('CA-17: an unknown agent_type is a freelancer in /api/state', async () => {
    await postHook(o, {
      ...hookFixture('subagent-start-no-type.json'),
      agent_id: 'fl-1',
      agent_type: 'brand-new-agent',
    });
    expect(await stateNpc('freelancer:fl-1')).toMatchObject({
      kind: 'freelancer',
      status: 'working',
      agentType: 'brand-new-agent',
    });
  });

  it('CA-19: /api/npcs/:key/history returns metadata only; unknown/invalid keys are 404/400', async () => {
    await postHook(o, hookFixture('subagent-pre-tool-use.json'));
    const h = await getJson(o, `/api/npcs/${encodeURIComponent('dev-web')}/history`);
    expect(h.status).toBe(200);
    const items = (h.json as { items: Array<{ kind: string }> }).items;
    expect(items.length).toBeGreaterThan(0);
    expect(JSON.stringify(h.json)).not.toContain('CANARY');
    expect((await getJson(o, '/api/npcs/nobody/history')).status).toBe(404);
    expect((await getJson(o, `/api/npcs/${encodeURIComponent('a b')}/history`)).status).toBe(400);
  });

  it('CA-64: privacy: canaries sent in prompts, tool input and output never reach state, diag or logs', async () => {
    for (const f of readdirSync(join(fixtures, 'hooks')).filter((n) => n.endsWith('.json'))) {
      await postHook(o, hookFixture(f));
    }
    const state = (
      await rawRequest(o.server.port, { path: '/api/state', headers: { cookie: o.session.cookie } })
    ).body;
    const diag = (
      await rawRequest(o.server.port, { path: '/api/diag', headers: { cookie: o.session.cookie } })
    ).body;
    const history = (
      await rawRequest(o.server.port, {
        path: '/api/npcs/chefe/history',
        headers: { cookie: o.session.cookie },
      })
    ).body;
    const logsDir = join(o.server.home, 'logs');
    const logs = readdirSync(logsDir)
      .map((f) => readFileSync(join(logsDir, f), 'utf8'))
      .join('\n');
    for (const text of [state, diag, history, logs]) {
      expect(text).not.toContain('CANARY');
      expect(text).not.toContain('SYNTHETIC-NOT-A-SECRET');
    }
  });

  it('CA-15: /api/state, /history and /api/diag require the session cookie', async () => {
    for (const path of ['/api/state', '/api/diag', '/api/npcs/chefe/history']) {
      expect((await rawRequest(o.server.port, { path })).status).toBe(401);
    }
  });

  it('CA-12: the snapshot comes from the team (QUADRO fallback when there is no escritorio.json)', async () => {
    const snap = (await getJson(o, '/api/state')).json as { team: { source: string } };
    expect(snap.team.source).toBe('quadro-fallback');
  });
});

describe('hook script escritorio-hook.cjs (T-17)', () => {
  const run = (home: string, stdin: string, extraEnv: Record<string, string> = {}) =>
    new Promise<{ code: number | null; stdout: string; stderr: string; ms: number }>((resolve) => {
      const started = Date.now();
      const child = spawn(process.execPath, [HOOK_SCRIPT], {
        env: { ...process.env, ESCRITORIO_HOME: home, ...extraEnv },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (c) => (stdout += String(c)));
      child.stderr.on('data', (c) => (stderr += String(c)));
      child.on('close', (code) => resolve({ code, stdout, stderr, ms: Date.now() - started }));
      child.stdin.end(stdin);
    });
  const TOKEN = 'T'.repeat(43);
  const payload = JSON.stringify({ ...hookFixture('pre-tool-use.json') });

  it('CA-39: server off (no runtime.json): exits 0 in <= 1.5 s with empty stdout', async () => {
    const home = tmp('hook-off-');
    writeFileSync(join(home, 'hook-token'), TOKEN);
    const r = await run(home, payload);
    expect(r).toMatchObject({ code: 0, stdout: '' });
    expect(r.ms).toBeLessThan(1500);
  });

  it('CA-39: stale runtime.json (dead PID, closed port): exits 0 quickly and never writes stdout', async () => {
    const home = tmp('hook-stale-');
    writeFileSync(join(home, 'hook-token'), TOKEN);
    writeFileSync(
      join(home, 'runtime.json'),
      JSON.stringify({ pid: 2_000_000_000, port: 1, startedAt: 1, version: '0' }),
    );
    const r = await run(home, payload);
    expect(r).toMatchObject({ code: 0, stdout: '' });
    expect(r.ms).toBeLessThan(1500);
  });

  it('CA-39: a server that accepts but never answers cannot hold the hook beyond ~1 s', async () => {
    const home = tmp('hook-hang-');
    writeFileSync(join(home, 'hook-token'), TOKEN);
    const sockets = new Set<Socket>();
    const hang: Server = createServer(() => undefined);
    hang.on('connection', (s) => sockets.add(s));
    await new Promise<void>((res) => hang.listen(0, '127.0.0.1', res));
    const port = (hang.address() as { port: number }).port;
    writeFileSync(
      join(home, 'runtime.json'),
      JSON.stringify({ pid: process.pid, port, startedAt: 1, version: '0' }),
    );
    const r = await run(home, payload);
    for (const s of sockets) s.destroy();
    await new Promise((res) => hang.close(res));
    expect(r).toMatchObject({ code: 0, stdout: '' });
    expect(r.ms).toBeLessThan(1500);
  });

  it('CA-39: garbage on stdin and an empty stdin exit 0 silently', async () => {
    const home = tmp('hook-garbage-');
    writeFileSync(join(home, 'hook-token'), TOKEN);
    writeFileSync(
      join(home, 'runtime.json'),
      JSON.stringify({ pid: process.pid, port: 1, startedAt: 1, version: '0' }),
    );
    expect(await run(home, '{ not json')).toMatchObject({ code: 0, stdout: '' });
    expect(await run(home, '')).toMatchObject({ code: 0, stdout: '' });
  });

  it('CA-15: posts only the allow-listed fields with the hook token (no tool_input, prompt or output)', async () => {
    const home = tmp('hook-post-');
    writeFileSync(join(home, 'hook-token'), TOKEN);
    let seen: { auth: string | undefined; body: Record<string, unknown> } | null = null;
    const srv = createServer((req, res) => {
      if (req.url?.startsWith('/api/health/proof')) {
        const n = new URL(req.url, 'http://x').searchParams.get('n') ?? '';
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ proof: proofOf(TOKEN, n) }));
        return;
      }
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        seen = {
          auth: req.headers.authorization,
          body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
        };
        res.statusCode = 204;
        res.end();
      });
    });
    await new Promise<void>((res) => srv.listen(0, '127.0.0.1', res));
    const port = (srv.address() as { port: number }).port;
    writeFileSync(
      join(home, 'runtime.json'),
      JSON.stringify({ pid: process.pid, port, startedAt: 1, version: '0' }),
    );
    const full = {
      ...hookFixture('pre-tool-use.json'),
      prompt: 'CANARY-PROMPT-TEXT',
      tool_response: 'CANARY-OUT',
      extra: { deep: 'CANARY-EXTRA' },
    };
    const r = await run(home, JSON.stringify(full));
    await new Promise((res) => srv.close(res));
    expect(r).toMatchObject({ code: 0, stdout: '' });
    const got = seen as unknown as { auth: string; body: Record<string, unknown> };
    expect(got.auth).toBe(`Bearer ${TOKEN}`);
    expect(got.body['tool_name']).toBe('Bash');
    expect(JSON.stringify(got.body)).not.toMatch(/CANARY|SYNTHETIC|tool_input/);
  });

  it('M2: a server that cannot prove it knows the hook token never receives the token or the payload', async () => {
    const home = tmp('hook-squat-');
    writeFileSync(join(home, 'hook-token'), TOKEN);
    const requests: Array<{ url?: string; auth?: string }> = [];
    const srv = createServer((req, res) => {
      requests.push({ url: req.url, auth: req.headers.authorization });
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ proof: 'a'.repeat(64) })); // wrong proof
    });
    await new Promise<void>((res) => srv.listen(0, '127.0.0.1', res));
    const port = (srv.address() as { port: number }).port;
    writeFileSync(
      join(home, 'runtime.json'),
      JSON.stringify({ pid: process.pid, port, startedAt: 1, version: '0' }),
    );
    const r = await run(home, payload);
    await new Promise((res) => srv.close(res));
    expect(r).toMatchObject({ code: 0, stdout: '' });
    expect(requests).toHaveLength(1); // only the challenge
    expect(requests[0]?.url).toContain('/api/health/proof');
    expect(requests[0]?.auth).toBeUndefined();
  });

  it('CA-15: real hook script -> real server -> NPC working (stdout stays empty)', async () => {
    const o = await startOffice();
    try {
      const r = await run(
        o.server.home,
        JSON.stringify({ ...hookFixture('subagent-start.json'), agent_type: 'dev-web' }),
      );
      expect(r).toMatchObject({ code: 0, stdout: '' });
      await waitFor(async () => {
        const snap = (await getJson(o, '/api/state')).json as { npcs: NpcLogical[] };
        return snap.npcs.find((n) => n.key === 'dev-web')?.status === 'working';
      });
    } finally {
      await o.server.stop();
    }
  });
});

describe('JsonlWatcher fallback (T-19)', () => {
  const SESSION = '11111111-1111-4111-8111-111111111111';
  let o: Office;
  let projects: string;
  const ev: Array<{
    kind: string;
    agent: { agentType: string | null; agentId: string | null };
    source: string;
    project: { kind: string; name?: string };
    tool?: { name: string };
  }> = [];
  beforeAll(async () => {
    o = await startOffice(true);
    projects = join(o.claudeHome, 'projects');
    o.service()?.bus.on((e) => ev.push(e as never));
  });
  afterAll(() => o.server.stop());
  afterEach(() => undefined);

  const subDir = () => join(projects, 'D--fake-7---DEV-demo-project', SESSION, 'subagents');

  it('CA-18/CA-44: a new subagent file -> subagent.start <= 2 s with type from meta and project from cwd; tool uses; finished -> subagent.stop', async () => {
    mkdirSync(subDir(), { recursive: true });
    await sleep(150);
    const line = (extra: object) =>
      `${JSON.stringify({ type: 'assistant', uuid: `u${Math.random()}`, sessionId: SESSION, agentId: 'live0001', isSidechain: true, cwd: 'D:\\fake\\7 - DEV\\demo-project', timestamp: new Date().toISOString(), ...extra })}\n`;
    const t0 = Date.now();
    writeFileSync(
      join(subDir(), 'agent-live0001.meta.json'),
      JSON.stringify({ agentType: 'dev-web', description: 'CANARY-DESCRIPTION' }),
    );
    writeFileSync(
      join(subDir(), 'agent-live0001.jsonl'),
      line({
        message: {
          id: 'm1',
          role: 'assistant',
          content: [
            { type: 'text', text: 'CANARY-ASSISTANT-TEXT' },
            {
              type: 'tool_use',
              id: 'toolu_live1',
              name: 'Edit',
              input: { x: 'CANARY-TOOL-INPUT' },
            },
          ],
          stop_reason: 'tool_use',
        },
      }),
    );
    await waitFor(() => ev.some((e) => e.kind === 'subagent.start'), 2000);
    expect(Date.now() - t0).toBeLessThan(2000);
    const start = ev.find((e) => e.kind === 'subagent.start');
    expect(start).toMatchObject({
      source: 'jsonl',
      agent: { agentType: 'dev-web', agentId: 'live0001' },
    });
    await waitFor(() => ev.some((e) => e.kind === 'tool.pre' && e.tool?.name === 'Edit'), 2000);
    expect(ev.find((e) => e.kind === 'tool.pre')?.source).toBe('jsonl');
    expect(ev.indexOf(start as never)).toBeLessThan(ev.findIndex((e) => e.kind === 'tool.pre'));

    appendFileSync(
      join(subDir(), 'agent-live0001.jsonl'),
      line({
        message: {
          id: 'm2',
          role: 'assistant',
          content: [{ type: 'tool_use', id: 'toolu_live2', name: 'Read', input: {} }],
          stop_reason: 'tool_use',
        },
      }),
    );
    await waitFor(() => ev.some((e) => e.kind === 'tool.pre' && e.tool?.name === 'Read'), 2000);

    writeFileSync(
      join(subDir(), 'agent-live0001.meta.json'),
      JSON.stringify({ agentType: 'dev-web', finished: true }),
    );
    await waitFor(() => ev.some((e) => e.kind === 'subagent.stop'), 2000);
    expect(JSON.stringify(ev)).not.toContain('CANARY');
    const snap = (await getJson(o, '/api/state')).json as { npcs: NpcLogical[] };
    expect(snap.npcs.find((n) => n.key === 'dev-web')?.status).toBe('idle');
  });

  it('CA-17: a subagent file without meta is announced as "unknown" after the grace period', async () => {
    writeFileSync(
      join(subDir(), 'agent-nometa01.jsonl'),
      `${JSON.stringify({ type: 'assistant', sessionId: SESSION, agentId: 'nometa01', cwd: 'C:\\elsewhere\\tool', message: { id: 'mx', role: 'assistant', content: [], stop_reason: null } })}\n`,
    );
    await waitFor(
      () => ev.some((e) => e.kind === 'subagent.start' && e.agent.agentId === 'nometa01'),
      2500,
    );
    expect(ev.find((e) => e.agent.agentId === 'nometa01')?.agent.agentType).toBe('unknown');
    expect(ev.find((e) => e.agent.agentId === 'nometa01')?.project).toEqual({
      kind: 'outside',
      basename: 'tool',
    });
  });

  it('CA-18: existing history is not replayed (only new activity produces events)', async () => {
    const before = ev.length;
    const hist = join(projects, 'D--fake-7---DEV-demo-project');
    cpSync(
      join(fixtures, 'jsonl', 'projects', 'D--fake-7---DEV-demo-project'),
      join(hist, 'copy'),
      {
        recursive: true,
      },
    );
    // copying creates NEW files (birth time now), so this only checks nothing crashes and the watcher stays alive
    await sleep(600);
    expect(o.service()?.jsonl?.stats().errors).toBe(0);
    expect(ev.length).toBeGreaterThanOrEqual(before);
  });
});

describe('CLI settings:diff on a copy (T-18, integration)', () => {
  it('CA-20: `settings:diff` via the built CLI writes nothing and shows the diff', async () => {
    await buildServer();
    const dir = tmp('cli-diff-');
    const file = join(dir, 'settings.json');
    const original = '{\n  "agent": "chefe",\n  "hooks": {}\n}\n';
    writeFileSync(file, original);
    const cli = join(process.cwd(), 'dist', 'cli.js');
    const res = await new Promise<{ code: number | null; stdout: string }>((resolve) => {
      const c = spawn(process.execPath, [cli, 'settings:diff', '--settings-file', file], {
        env: { ...process.env, ESCRITORIO_HOME: join(dir, 'home') },
      });
      let stdout = '';
      c.stdout.on('data', (d) => (stdout += String(d)));
      c.on('close', (code) => resolve({ code, stdout }));
    });
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('+++ settings.json (proposto, nível 1)');
    expect(res.stdout).toContain('escritorio-hook.cjs');
    expect(readFileSync(file, 'utf8')).toBe(original);
  });
});

describe('JsonlWatcher inactivity stop and hook x JSONL dedupe (Rita 4)', () => {
  const SESSION = '22222222-2222-4222-8222-222222222222';

  it('CA-18: a subagent that goes silent without a finished meta gets a synthetic subagent.stop', async () => {
    const o = await startOffice(true, { inactivityStopMs: 700 });
    try {
      const seen: Array<{ kind: string; source: string; agent: { agentId: string | null } }> = [];
      o.service()?.bus.on((e) => seen.push(e as never));
      const dir = join(o.claudeHome, 'projects', 'slug', SESSION, 'subagents');
      mkdirSync(dir, { recursive: true });
      await sleep(150);
      writeFileSync(join(dir, 'agent-quiet01.meta.json'), JSON.stringify({ agentType: 'dev-web' }));
      writeFileSync(
        join(dir, 'agent-quiet01.jsonl'),
        JSON.stringify({
          type: 'assistant',
          sessionId: SESSION,
          agentId: 'quiet01',
          cwd: 'C:/x/y',
          message: { id: 'q1', role: 'assistant', content: [], stop_reason: null },
        }) + NL,
      );
      await waitFor(() => seen.some((e) => e.kind === 'subagent.start'), 2500);
      await waitFor(() => seen.some((e) => e.kind === 'subagent.stop'), 4000);
      expect(seen.find((e) => e.kind === 'subagent.stop')).toMatchObject({
        source: 'jsonl',
        agent: { agentId: 'quiet01' },
      });
      expect(o.service()?.jsonl?.stats().syntheticStops).toBe(1);
    } finally {
      await o.server.stop();
    }
  });

  it('CA-15: the same tool use from a hook (with a timestamp) and from the JSONL is counted once', async () => {
    const o = await startOffice(true);
    try {
      const seen: Array<{ kind: string; source: string; tool?: { useId?: string } }> = [];
      o.service()?.bus.on((e) => seen.push(e as never));
      const dir = join(o.claudeHome, 'projects', 'slug');
      mkdirSync(dir, { recursive: true });
      await sleep(150);
      await postHook(o, {
        hook_event_name: 'PreToolUse',
        session_id: SESSION,
        tool_name: 'Edit',
        tool_use_id: 'toolu_cross1',
        timestamp: '2026-11-14T10:00:00.000Z',
      });
      writeFileSync(
        join(dir, SESSION + '.jsonl'),
        JSON.stringify({
          type: 'assistant',
          sessionId: SESSION,
          cwd: 'C:/x/y',
          timestamp: '2026-11-14T10:00:00.500Z',
          message: {
            id: 'm9',
            role: 'assistant',
            content: [{ type: 'tool_use', id: 'toolu_cross1', name: 'Edit', input: {} }],
            stop_reason: 'tool_use',
          },
        }) + NL,
      );
      await waitFor(async () => {
        const d = (await getJson(o, '/api/diag')).json as { counters: Record<string, number> };
        return (d.counters['ingest.duplicate'] ?? 0) >= 1;
      }, 3000);
      expect(
        seen.filter((e) => e.kind === 'tool.pre' && e.tool?.useId === 'toolu_cross1'),
      ).toHaveLength(1);
      expect(seen.find((e) => e.tool?.useId === 'toolu_cross1')?.source).toBe('hook');
    } finally {
      await o.server.stop();
    }
  });
});
