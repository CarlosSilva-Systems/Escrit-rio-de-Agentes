import { ChildProcess } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import net from 'node:net';
import { join, relative, sep } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { login, rawRequest, startTestServer, type TestServer } from '../helpers/server';

// T-33: repository-level checks for CA-05 (licence / credits) and CA-09 (no paid API, no outside
// network) plus the secrets hygiene rules of CLAUDE.md.

const ROOT = join(import.meta.dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

function walk(dir: string, filter: (file: string) => boolean, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (['node_modules', 'dist', 'test-results', '.git', 'third_party'].includes(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, filter, out);
    else if (filter(full)) out.push(full);
  }
  return out;
}

const productionSources = () =>
  walk(
    join(ROOT, 'src'),
    (f) => /\.(ts|tsx|cjs|mjs|js)$/.test(f) && !/\.(test|spec)\.tsx?$/.test(f),
  );

describe('CA-05: licence, notice and credits', () => {
  it('CA-05: LICENSE is MIT and keeps the Pixel Agents copyright; the upstream licence is kept in third_party', () => {
    const licence = read('LICENSE');
    expect(licence).toMatch(/^MIT License/);
    expect(licence).toContain('Pablo De Lucca');
    expect(existsSync(join(ROOT, 'third_party', 'pixel-agents', 'LICENSE'))).toBe(true);
    expect(read('third_party/pixel-agents/LICENSE')).toContain('Copyright (c) 2026 Pablo De Lucca');
  });

  it('CA-05: NOTICE and CREDITS exist in en and pt-BR and name pablodelucca/pixel-agents', () => {
    for (const file of ['NOTICE.md', 'NOTICE.pt-BR.md', 'CREDITS.md', 'CREDITS.pt-BR.md']) {
      expect(existsSync(join(ROOT, file)), file).toBe(true);
      expect(read(file), file).toContain('pablodelucca/pixel-agents');
    }
  });

  it('CA-05: both credits tables list the same assets (same number of rows; licences and URLs match across languages)', () => {
    const rows = (text: string) =>
      text
        .split('\n')
        .filter((l) => l.startsWith('|') && !/^\|\s*-/.test(l))
        .slice(1) // header
        .map((l) =>
          l
            .split('|')
            .map((c) => c.trim())
            .filter(Boolean),
        );
    const en = rows(read('CREDITS.md'));
    const pt = rows(read('CREDITS.pt-BR.md'));
    expect(en.length).toBeGreaterThan(0);
    expect(pt.length).toBe(en.length);
    en.forEach((row, i) => {
      // licence and URL are language independent; the asset name, author text and notes are translated
      expect(pt[i]![2], `row ${i + 1} licence`).toEqual(row[2]);
      expect(pt[i]![3]!.split(' ')[0], `row ${i + 1} URL`).toEqual(row[3]!.split(' ')[0]);
    });
    for (const row of en) {
      expect(row.length, row.join('|')).toBe(4);
      expect(row[3]).toMatch(/^https?:\/\//);
    }
  });

  it('CA-05: every source file that carries the Pixel Agents header is listed in NOTICE.md (and vice versa)', () => {
    const header = 'Portions derived from Pixel Agents';
    const withHeader = walk(join(ROOT, 'src'), (f) => /\.(ts|tsx|cjs)$/.test(f))
      .filter((f) => readFileSync(f, 'utf8').slice(0, 400).includes(header))
      .map((f) => relative(ROOT, f).split(sep).join('/'));
    const notice = read('NOTICE.md');
    const table = notice.split('## Derived files')[1] ?? '';
    const listed = [...table.matchAll(/^\|\s*`?([^|`]+?)`?\s*\|/gm)]
      .map((m) => m[1]!.trim())
      .filter((v) => v.startsWith('src/'));
    expect(listed.sort()).toEqual(withHeader.sort());
  });

  it('CA-05: the Credits screen reads its entries from the same names as CREDITS.md (no asset only in the UI)', () => {
    const ui = read('src/web/hud/credits/creditEntries.ts');
    expect(ui).toContain('Pixel Agents');
    expect(ui).toMatch(/Pixelify Sans/);
    expect(ui).toMatch(/Silkscreen/);
  });
});

describe('secrets hygiene (CLAUDE.md, ADR-0005)', () => {
  it('.env files and private art are git-ignored, and .env.example holds no secret', () => {
    const ignore = read('.gitignore');
    expect(ignore).toMatch(/^\.env$/m);
    expect(ignore).toMatch(/^!\.env\.example$/m);
    expect(ignore).toMatch(/^assets-private\/$/m);
    expect(existsSync(join(ROOT, '.env'))).toBe(false);
    const example = read('.env.example');
    expect(example).not.toMatch(/(token|secret|password|key)\s*=\s*\S{8,}/i);
    expect(example).toContain('ESCRITORIO_PORT=3200');
  });

  it('no source file embeds something that looks like a long token, a private key or a bearer value', () => {
    const suspicious =
      /(-----BEGIN [A-Z ]*PRIVATE KEY-----|sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16})/;
    const hits = productionSources().filter((f) => suspicious.test(readFileSync(f, 'utf8')));
    expect(hits.map((f) => relative(ROOT, f))).toEqual([]);
  });
});

describe('CA-09: no paid API and no outside network by default', () => {
  it('CA-09: package.json has no Anthropic SDK, HTTP client or telemetry dependency', () => {
    const pkg = JSON.parse(read('package.json')) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    const all = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    expect(
      all.filter((n) =>
        /anthropic|openai|axios|node-fetch|got$|undici|sentry|posthog|segment|analytics/i.test(n),
      ),
    ).toEqual([]);
  });

  it('CA-09: production code never calls `claude -p`, the Agent SDK or an Anthropic endpoint', () => {
    const bad = [
      /api\.anthropic\.com/,
      /@anthropic-ai\//,
      /claude-agent-sdk/,
      /claude[^\n]{0,120}['"]-p['"]/i, // spawn(claude, ['-p', ...])
      /--print\b/,
    ];
    const offenders: string[] = [];
    for (const f of productionSources()) {
      const text = readFileSync(f, 'utf8');
      for (const re of bad) if (re.test(text)) offenders.push(`${relative(ROOT, f)} ~ ${re}`);
    }
    expect(offenders).toEqual([]);
  });

  it('CA-09: the web app and the server only reference loopback origins for requests (no http(s):// URL is fetched)', () => {
    const offenders: string[] = [];
    for (const f of productionSources()) {
      const text = readFileSync(f, 'utf8');
      for (const m of text.matchAll(
        /\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts)\s*\(\s*([`'"])(https?|wss?):\/\/([^`'"/]+)/g,
      )) {
        if (!/^(127\.0\.0\.1|localhost|\[::1\])/.test(m[4]!))
          offenders.push(`${relative(ROOT, f)}: ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
    const html = read('src/web/index.html');
    expect(html).not.toMatch(/(src|href)=["']https?:\/\//);
  });

  describe('runtime: while the server is used it only connects to loopback and spawns nothing that is claude', () => {
    let server: TestServer;
    const connects: string[] = [];
    const spawned: string[] = [];
    let restoreConnect: (() => void) | undefined;

    beforeAll(async () => {
      const origConnect = net.Socket.prototype.connect;
      const connectSpy = vi.spyOn(net.Socket.prototype, 'connect').mockImplementation(function (
        this: net.Socket,
        ...args: unknown[]
      ) {
        let first = args[0];
        if (Array.isArray(first)) first = first[0]; // net normalises to [options, cb]
        if (typeof first === 'object' && first !== null) {
          const o = first as { host?: string; port?: number; path?: string };
          connects.push(o.path ? `pipe:${o.path}` : `${o.host ?? 'localhost'}:${o.port}`);
        } else if (typeof first === 'number') {
          connects.push(`${typeof args[1] === 'string' ? args[1] : 'localhost'}:${first}`);
        }
        return (origConnect as (...a: unknown[]) => net.Socket).apply(this, args);
      });
      // `spawn` is an internal method of ChildProcess (every spawn/exec/execFile goes through it).
      const proto = ChildProcess.prototype as unknown as { spawn: (...a: unknown[]) => unknown };
      const origSpawn = proto.spawn;
      const spawnSpy = vi.spyOn(proto, 'spawn').mockImplementation(function (
        this: ChildProcess,
        ...args: unknown[]
      ) {
        const opts = args[0] as { file?: string; args?: string[] } | undefined;
        spawned.push([opts?.file, ...(opts?.args ?? [])].join(' '));
        return (origSpawn as (...a: unknown[]) => unknown).apply(this, args) as never;
      });
      restoreConnect = () => {
        connectSpy.mockRestore();
        spawnSpy.mockRestore();
      };
      server = await startTestServer();
    });
    afterAll(async () => {
      restoreConnect?.();
      await server.stop();
    });

    it('CA-09: login, session, hook traffic and a WebSocket produce only 127.0.0.1 connections and no claude process', async () => {
      const session = await login(server);
      await rawRequest(server.port, { path: '/api/session', headers: { cookie: session.cookie } });
      const hookToken = readFileSync(join(server.home, 'hook-token'), 'utf8').trim();
      for (let i = 0; i < 20; i++) {
        await rawRequest(server.port, {
          method: 'POST',
          path: '/api/hooks/v1/claude',
          headers: { authorization: `Bearer ${hookToken}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            hook_event_name: 'SubagentStart',
            agent_type: 'dev-web',
            agent_id: `n${i}`,
          }),
        });
      }
      const Ctor = WebSocket as unknown as new (
        u: string,
        i?: { headers?: Record<string, string> },
      ) => WebSocket;
      const ws = new Ctor(`ws://127.0.0.1:${server.port}/ws`, {
        headers: { Origin: session.origin, Cookie: session.cookie },
      });
      await new Promise((r) => ws.addEventListener('message', r, { once: true }));
      ws.close();
      await new Promise((r) => setTimeout(r, 300));
      expect(connects.length).toBeGreaterThan(0);
      expect(connects.filter((c) => !/^127\.0\.0\.1:\d+$/.test(c))).toEqual([]);
      expect(spawned.filter((s) => /claude/i.test(s))).toEqual([]);
    });
  });
});
