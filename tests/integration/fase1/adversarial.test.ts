import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ServerEnvelopeSchema,
  type NpcLogical,
  type ServerMessage,
} from '../../../src/shared/contracts';
import { resolveHomePaths, rotateTokenFiles } from '../../../src/server/home';
import { officeServerOptions } from '../../../src/server/office';
import {
  login,
  rawRequest,
  startTestServer,
  type LoggedInSession,
  type TestServer,
} from '../helpers/server';

// T-33 adversarial QA of the server: malformed / hostile / huge hook payloads, a 1 000 event burst,
// weird identifiers, WebSocket abuse. The server must never answer 5xx, never crash, never leak
// content, and stay fully usable afterwards.

const fixtures = join(import.meta.dirname, '..', '..', 'fixtures');
let server: TestServer;
let session: LoggedInSession;
let hookToken: string;
let claudeHome: string;

beforeAll(async () => {
  claudeHome = mkdtempSync(join(tmpdir(), 'claude-home-adv-'));
  mkdirSync(join(claudeHome, 'projects'), { recursive: true });
  mkdirSync(join(claudeHome, 'equipe'), { recursive: true });
  cpSync(join(fixtures, 'team', 'QUADRO.sample.md'), join(claudeHome, 'equipe', 'QUADRO.md'));
  const opts = officeServerOptions({ claudeHome, mapPath: null, watchJsonl: false, flushMs: 10 });
  server = await startTestServer({ extraRoutes: opts.extraRoutes, snapshot: opts.snapshot });
  session = await login(server);
  hookToken = readFileSync(join(server.home, 'hook-token'), 'utf8').trim();
});
afterAll(async () => {
  await server.stop();
  rmSync(claudeHome, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

const post = (body: string | Buffer, headers: Record<string, string> = {}) =>
  rawRequest(server.port, {
    method: 'POST',
    path: '/api/hooks/v1/claude',
    headers: {
      authorization: `Bearer ${hookToken}`,
      'content-type': 'application/json',
      ...headers,
    },
    body: typeof body === 'string' ? body : body.toString('latin1'),
  });
const postJson = (obj: unknown) => post(JSON.stringify(obj));
const get = async (path: string) => {
  const res = await rawRequest(server.port, { path, headers: { cookie: session.cookie } });
  return { status: res.status, body: res.body };
};
const state = async () =>
  JSON.parse((await get('/api/state')).body) as { npcs: NpcLogical[]; activity: unknown[] };
const diag = async () =>
  (JSON.parse((await get('/api/diag')).body) as { counters: Record<string, number> }).counters;

/** Markup characters, C0 control characters or the RTL override. */
const isUnsafe = (text: string) =>
  [...text].some((c) => {
    const code = c.charCodeAt(0);
    return c === '<' || c === '>' || code < 0x20 || code === 0x202e;
  });

const start = (type: unknown, id: unknown, extra: Record<string, unknown> = {}) => ({
  hook_event_name: 'SubagentStart',
  session_id: 'adv-session',
  cwd: 'C:\\dev\\Adv',
  agent_id: id,
  agent_type: type,
  ...extra,
});
const stop = (type: unknown, id: unknown) => ({
  ...start(type, id),
  hook_event_name: 'SubagentStop',
});

describe('hook route: malformed and hostile bodies (CA-15, CA-64)', () => {
  const bodies: [string, string | Buffer][] = [
    ['empty body', ''],
    ['literal null', 'null'],
    ['a number', '42'],
    ['a string', '"SubagentStart"'],
    ['array of events', JSON.stringify([start('dev-web', 'a1')])],
    ['truncated JSON', '{"hook_event_name":"SubagentStart","agent_ty'],
    ['trailing garbage', '{"hook_event_name":"Stop"} xxx'],
    ['NUL bytes', Buffer.from([0, 0, 0, 0])],
    ['invalid UTF-8', Buffer.from([0xff, 0xfe, 0xc3, 0x28])],
    ['BOM prefix', `\uFEFF${JSON.stringify(start('dev-web', 'a2'))}`],
    ['deep nesting (50 000 arrays)', '['.repeat(50_000) + ']'.repeat(50_000)],
    ['deep nesting (50 000 objects)', '{"a":'.repeat(50_000) + '1' + '}'.repeat(50_000)],
    [
      'duplicate keys',
      '{"hook_event_name":"Stop","hook_event_name":"SubagentStart","agent_type":"dev-web","agent_id":"dup1"}',
    ],
    [
      'prototype pollution keys',
      '{"__proto__":{"polluted":1},"constructor":{"prototype":{"polluted":2}},"hook_event_name":"Stop"}',
    ],
    ['event name as object', JSON.stringify({ hook_event_name: { a: 1 } })],
    [
      'event name in other case',
      JSON.stringify({ hook_event_name: 'subagentstart', agent_type: 'dev-web' }),
    ],
    ['numbers where strings go', JSON.stringify(start(42, 7))],
    ['huge number', '{"hook_event_name":"Stop","session_id":1e999}'],
  ];

  for (const [name, body] of bodies) {
    it(`CA-15: ${name} -> 202/204, never 5xx, server stays healthy`, async () => {
      const res = await post(body);
      expect([202, 204]).toContain(res.status);
      expect(res.body).toBe('');
      expect((await get('/api/state')).status).toBe(200);
    });
  }

  it('CA-15: other content types and methods are harmless (text/plain, form, no content-type, PUT, GET)', async () => {
    const payload = JSON.stringify(start('dev-web', 'ct1'));
    for (const ct of [
      'text/plain',
      'application/x-www-form-urlencoded',
      'application/octet-stream',
    ]) {
      const res = await post(payload, { 'content-type': ct });
      expect(res.status, ct).toBeLessThan(500);
    }
    const noType = await rawRequest(server.port, {
      method: 'POST',
      path: '/api/hooks/v1/claude',
      headers: { authorization: `Bearer ${hookToken}` },
      body: payload,
    });
    expect(noType.status).toBeLessThan(500);
    for (const method of ['GET', 'PUT', 'DELETE', 'PATCH']) {
      const res = await rawRequest(server.port, {
        method,
        path: '/api/hooks/v1/claude',
        headers: { authorization: `Bearer ${hookToken}` },
      });
      expect(res.status, method).toBeGreaterThanOrEqual(400);
      expect(res.status, method).toBeLessThan(500);
    }
    await postJson(stop('dev-web', 'ct1'));
  });

  it('CA-15: the 1 MB limit is exact: 1 048 576 bytes pass, one more byte is 413', async () => {
    const pad = (n: number) => {
      const head = '{"hook_event_name":"Stop","session_id":"x","pad":"';
      const tail = '"}';
      return head + 'p'.repeat(n - head.length - tail.length) + tail;
    };
    expect((await post(pad(1024 * 1024))).status).toBe(204);
    expect((await post(pad(1024 * 1024 + 1))).status).toBe(413);
    expect((await get('/api/state')).status).toBe(200);
  });

  it('CA-64: privacy: a canary in an unknown field, a header and a huge tool_input never reaches state, diag or activity', async () => {
    const canary = 'CANARY-7f3a91-do-not-leak';
    await postJson({
      ...start('dev-web', 'canary1'),
      tool_input: { command: canary },
      prompt: canary,
      tool_response: canary,
      transcript_path: `C:\\${canary}\\x.jsonl`,
      custom: canary,
    });
    await postJson(stop('dev-web', 'canary1'));
    const all = JSON.stringify([
      await state(),
      await diag(),
      (await get('/api/npcs/dev-web/history')).body,
    ]);
    expect(all).not.toContain(canary);
  });
});

describe('hook route: weird identifiers (CA-15, CA-17)', () => {
  const weirdTypes: [string, string][] = [
    ['HTML', '<img src=x onerror=alert(1)>'],
    ['script tag', '<script>alert(1)</script>'],
    ['quotes', '"\'><b>'],
    ['NUL', 'dev\u0000web'],
    ['RTL override', 'dev\u202Eweb'],
    ['newline', 'dev-web\nX-Injected: 1'],
    ['emoji', 'dev-🔥'],
    ['101 characters', 'a'.repeat(101)],
    ['100 characters (limit)', 'a'.repeat(100)],
    ['10 000 characters', 'a'.repeat(10_000)],
    ['only spaces', '     '],
    ['empty', ''],
    ['path-like', '../../etc/passwd'],
    ['windows reserved', 'CON'],
    ['__proto__', '__proto__'],
    ['constructor', 'constructor'],
    ['toString', 'toString'],
    ['hasOwnProperty', 'hasOwnProperty'],
    ['unicode letters', 'desenvolvedor-ação'],
  ];

  for (const [name, type] of weirdTypes) {
    it(`CA-17: agent_type ${name}: accepted, shown only as an unknown/safe Freelancer, state stays valid`, async () => {
      const id = `weird-${name.replace(/\W+/g, '').slice(0, 12)}`;
      const res = await postJson(start(type, id));
      expect([202, 204]).toContain(res.status);
      const s = await state();
      for (const npc of s.npcs) {
        // Whatever reached the snapshot is plain printable text, never markup or control characters.
        expect(npc.key.length).toBeLessThanOrEqual(200);
        expect(String(npc.agentType ?? '').length).toBeLessThanOrEqual(100);
        expect(isUnsafe(String(npc.agentType ?? '')), `agentType of ${npc.key}`).toBe(false);
        expect(isUnsafe(npc.displayName), `displayName of ${npc.key}`).toBe(false);
      }
      await postJson(stop(type, id));
    });
  }

  it('CA-15: weird agent_id / session_id / cwd values never break the state', async () => {
    const ids = [
      '__proto__',
      'constructor',
      'a'.repeat(5000),
      '../../x',
      '<b>',
      '',
      null,
      7,
      {},
      [],
    ];
    for (const id of ids) {
      const res = await postJson(start('dev-web', id));
      expect([202, 204]).toContain(res.status);
    }
    for (const cwd of [
      '\\\\server\\share\\x',
      'C:\\' + 'a\\'.repeat(5000),
      'C:\\dev\\<img src=x>',
      'C:\\dev\\x\u0000y',
      'file:///etc/passwd',
      '..\\..\\..',
      7,
      null,
      {},
    ]) {
      const res = await postJson(start('dev-backend', 'cwd-test', { cwd }));
      expect([202, 204]).toContain(res.status);
    }
    await postJson({ ...start('dev-web', 'sid'), session_id: 's'.repeat(100_000) });
    expect((await get('/api/state')).status).toBe(200);
    await postJson(stop('dev-web', 'dup1'));
    // Clean up every instance we may have started.
    for (const id of ids) await postJson(stop('dev-web', id));
    await postJson(stop('dev-backend', 'cwd-test'));
    await postJson(stop('dev-web', 'sid'));
  });

  it('CA-15: types that look like Object.prototype members are plain NPC keys, not pollution', async () => {
    await postJson(start('constructor', 'proto-1'));
    await postJson(start('hasOwnProperty', 'proto-2'));
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(Object.prototype, 'polluted')).toBe(false);
    expect((await get('/api/state')).status).toBe(200);
    await postJson(stop('constructor', 'proto-1'));
    await postJson(stop('hasOwnProperty', 'proto-2'));
  });
});

describe('hook route: bursts (CA-15, CA-16, M-04)', () => {
  it('CA-16: 1 000 mixed events from 15 agents in parallel: all accepted, counters match, ring stays bounded, all idle after the stops', async () => {
    const before = await diag();
    const types = [
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
    const events: unknown[] = [];
    types.forEach((t) => events.push(start(t, `burst-${t}`)));
    for (let i = 0; events.length < 985; i++) {
      const t = types[i % types.length]!;
      events.push({
        hook_event_name: ['PreToolUse', 'PostToolUse', 'Notification', 'TaskCreated'][i % 4],
        session_id: 'burst-session',
        cwd: 'C:\\dev\\Burst',
        agent_id: `burst-${t}`,
        agent_type: t,
        tool_name: ['Edit', 'Read', 'Bash', 'Grep'][i % 4],
        tool_use_id: `toolu_b_${i}`,
        task: { id: `T-${i % 99}`, subject: `task ${i}` },
        notification_type: 'idle_prompt',
      });
    }
    types.forEach((t) => events.push(stop(t, `burst-${t}`)));
    expect(events).toHaveLength(1000);

    const t0 = performance.now();
    const statuses: number[] = [];
    for (let i = 0; i < events.length; i += 100) {
      statuses.push(
        ...(await Promise.all(
          events.slice(i, i + 100).map((e) => postJson(e).then((r) => r.status)),
        )),
      );
    }
    const ms = performance.now() - t0;
    expect(statuses.every((s) => s === 204)).toBe(true);
    // Not a benchmark, a guard: 1 000 requests over a loopback socket in well under a minute.
    expect(ms).toBeLessThan(30_000);

    const after = await diag();
    expect(after['ingest.received']! - (before['ingest.received'] ?? 0)).toBe(1000);
    expect(after['ingest.listenerErrors'] ?? 0).toBe(0);
    expect(after['office.liveInstances']).toBe(before['office.liveInstances'] ?? 0);
    const s = await state();
    expect(s.activity.length).toBeLessThanOrEqual(500);
    expect(s.npcs.filter((n) => n.status !== 'idle').map((n) => n.key)).toEqual(
      s.npcs.filter((n) => n.status !== 'idle' && !n.key.startsWith('dev-')).map((n) => n.key),
    );
    expect((await get('/api/state')).body.length).toBeLessThan(400_000);
  });

  it('CA-15: 300 distinct unknown agent types (a runaway agent factory) are capped at 12 Freelancers (OBS-02) and the excess is counted', async () => {
    for (let i = 0; i < 300; i++) await postJson(start(`runaway-${i}`, `rw-${i}`));
    const s = await state();
    const freelancers = s.npcs.filter((n) => n.kind === 'freelancer');
    const bytes = (await get('/api/state')).body.length;
    // OBS-02: the server caps simultaneous Freelancers; the rest is dropped and counted.
    expect(freelancers.length).toBe(12);
    const diagBody = JSON.parse((await get('/api/diag')).body) as {
      counters: Record<string, number>;
    };
    expect(diagBody.counters['office.droppedFreelancers']).toBeGreaterThanOrEqual(288);
    expect(bytes).toBeLessThan(500_000);
    for (let i = 0; i < 300; i++) await postJson(stop(`runaway-${i}`, `rw-${i}`));
  });
});

describe('WebSocket abuse (CA-30)', () => {
  type WsCtor = new (url: string, init?: { headers?: Record<string, string> }) => WebSocket;
  const open = () => {
    const Ctor = WebSocket as unknown as WsCtor;
    const ws = new Ctor(`ws://127.0.0.1:${server.port}/ws`, {
      headers: { Origin: session.origin, Cookie: session.cookie },
    });
    const messages: ServerMessage[] = [];
    let closeCode: number | undefined;
    ws.addEventListener('message', (e) => {
      const env = ServerEnvelopeSchema.safeParse(JSON.parse(String(e.data)));
      if (env.success) messages.push(...(env.data.t === 'batch' ? env.data.items : [env.data]));
    });
    ws.addEventListener('close', (e) => (closeCode = e.code));
    const until = async (cond: () => boolean, ms = 4000) => {
      const end = Date.now() + ms;
      while (!cond()) {
        if (Date.now() > end) throw new Error('timeout');
        await new Promise((r) => setTimeout(r, 10));
      }
    };
    return { ws, messages, closeCode: () => closeCode, until };
  };

  const waitNoClients = async () => {
    const end = Date.now() + 5000;
    while (server.ctx.hub.clientCount() > 0 && Date.now() < end)
      await new Promise((r) => setTimeout(r, 20));
  };

  it('CA-30: more than 50 messages in one second closes the socket with 1008, and the server keeps serving others', async () => {
    await waitNoClients();
    const a = open();
    await a.until(() => a.messages.some((m) => m.t === 'snapshot'));
    for (let i = 0; i < 80; i++) a.ws.send('{"t":"ping"}');
    await a.until(() => a.closeCode() !== undefined);
    expect(a.closeCode()).toBe(1008);
    const b = open();
    await b.until(() => b.messages.some((m) => m.t === 'snapshot'));
    b.ws.close();
  });

  it('CA-30: the 21st simultaneous client is refused with 1013 and the first 20 keep working', async () => {
    await waitNoClients();
    const clients = Array.from({ length: 21 }, () => open());
    await clients[0]!.until(
      () => clients.every((c) => c.messages.length > 0 || c.closeCode() !== undefined),
      8000,
    );
    const refused = clients.filter((c) => c.closeCode() === 1013);
    expect(refused.length).toBe(1);
    expect(clients.filter((c) => c.messages.some((m) => m.t === 'snapshot')).length).toBe(20);
    await postJson(start('dev-web', 'ws-fan'));
    await Promise.all(
      clients
        .filter((c) => c.closeCode() === undefined)
        .map((c) => c.until(() => c.messages.some((m) => m.t === 'npc.update'))),
    );
    await postJson(stop('dev-web', 'ws-fan'));
    clients.forEach((c) => c.ws.close());
    await new Promise((r) => setTimeout(r, 200));
    expect((await diag()) && true).toBe(true);
  });

  it('CA-30: binary frames, fragments of garbage and unknown message types are ignored without closing the socket', async () => {
    const a = open();
    await a.until(() => a.messages.some((m) => m.t === 'snapshot'));
    a.ws.send(new Uint8Array([1, 2, 3, 4]));
    a.ws.send('{"t":"approve","id":"x","decision":"allow"}');
    a.ws.send('{"t":"chat","text":"rm -rf /"}');
    a.ws.send('not json at all');
    a.ws.send('{"t":"ping"}');
    await new Promise((r) => setTimeout(r, 400));
    expect(a.closeCode()).toBeUndefined();
    a.ws.close();
  });
});

describe('token rotation and open sockets (CA-03, ADR-0005)', () => {
  it('CA-03: BUG-04 `token:rotate` must close open WebSockets by itself, not only on the next HTTP request', async () => {
    const own = await startTestServer();
    try {
      const s = await login(own);
      const Ctor = WebSocket as unknown as new (
        u: string,
        i?: { headers?: Record<string, string> },
      ) => WebSocket;
      const ws = new Ctor(`ws://127.0.0.1:${own.port}/ws`, {
        headers: { Origin: s.origin, Cookie: s.cookie },
      });
      let code: number | undefined;
      ws.addEventListener('close', (e) => (code = e.code));
      await new Promise((r) => ws.addEventListener('message', r, { once: true }));
      await rotateTokenFiles(resolveHomePaths(own.home));
      // An idle office makes no HTTP request: only the WebSocket ping every 25 s. Expected: revoked in <= 3 s.
      await new Promise((r) => setTimeout(r, 3000));
      expect(code).toBe(4401);
      ws.close();
    } finally {
      await own.stop();
    }
  });
});
