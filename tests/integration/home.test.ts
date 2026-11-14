import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ConfigStore,
  DEFAULT_PUBLIC_CONFIG,
  EnvError,
  loadServerEnv,
} from '../../src/server/config';
import {
  ensureHome,
  isProcessAlive,
  readRuntimeInfo,
  removeRuntimeInfo,
  renameWithRetry,
  resolveHomePaths,
  rotateTokenFiles,
  TokenStore,
  writeFileAtomic,
  writeRuntimeInfo,
  type HomePaths,
} from '../../src/server/home';
import { allDictionaries, resolveLang, t } from '../../src/server/i18n';
import { LogSink, pathOnly, pruneOldLogs } from '../../src/server/log';

const execFileAsync = promisify(execFile);

let root: string;
let paths: HomePaths;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'escritorio-home-'));
  paths = resolveHomePaths(join(root, 'home'));
  await ensureHome(paths);
});
afterEach(() => rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }));

describe('home and tokens (T-11)', () => {
  it('CA-03: creates 256-bit base64url tokens (master and hook, distinct) and keeps them across loads', async () => {
    const first = await TokenStore.load(paths);
    const master = (await readFile(paths.tokenFile, 'utf8')).trim();
    const hook = (await readFile(paths.hookTokenFile, 'utf8')).trim();
    expect(master).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hook).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(master).not.toBe(hook);
    expect(first.verifyMaster(master)).toBe(true);
    expect(first.verifyMaster(hook)).toBe(false);
    expect(first.verifyHook(hook)).toBe(true);
    expect(first.verifyMaster('')).toBe(false);
    expect(first.verifyMaster(master + 'x')).toBe(false);

    const second = await TokenStore.load(paths);
    expect(second.verifyMaster(master)).toBe(true);
    expect(second.generation()).toBe(first.generation());
  });

  it('regenerates a corrupt token file instead of trusting it', async () => {
    await writeFile(paths.tokenFile, 'short');
    const store = await TokenStore.load(paths);
    expect(store.verifyMaster('short')).toBe(false);
    expect((await readFile(paths.tokenFile, 'utf8')).trim()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it.skipIf(process.platform !== 'win32')(
    'CA-03: token files carry no inherited or wide ACEs (only the user, SYSTEM and Administrators)',
    async () => {
      await TokenStore.load(paths);
      const ps = async (command: string) =>
        (
          await execFileAsync('powershell.exe', [
            '-NoProfile',
            '-NonInteractive',
            '-Command',
            command,
          ])
        ).stdout;
      const userSid = (
        await ps('[Security.Principal.WindowsIdentity]::GetCurrent().User.Value')
      ).trim();
      for (const file of [paths.tokenFile, paths.hookTokenFile]) {
        const out = await ps(
          `(Get-Acl -LiteralPath '${file}').Access | ForEach-Object { $_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value + '|' + $_.IsInherited }`,
        );
        const entries = out
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean)
          .map((l) => l.split('|'));
        expect(entries.length, out).toBeGreaterThan(0);
        const allowed = new Set([userSid, 'S-1-5-18', 'S-1-5-32-544']);
        for (const [sid, inherited] of entries) {
          expect(allowed.has(sid!), `unexpected ACE for ${sid}`).toBe(true);
          expect(inherited, 'inheritance must be removed').toBe('False');
        }
        expect(entries.some(([sid]) => sid === userSid)).toBe(true);
      }
    },
  );

  it('rotateTokenFiles writes new tokens and a running TokenStore notices and emits "rotated"', async () => {
    const store = await TokenStore.load(paths);
    const oldMaster = (await readFile(paths.tokenFile, 'utf8')).trim();
    const oldGeneration = store.generation();
    let rotated = 0;
    store.on('rotated', () => rotated++);

    expect(await store.reloadIfChanged()).toBe(false);
    await new Promise((r) => setTimeout(r, 20));
    await rotateTokenFiles(paths);
    expect(await store.reloadIfChanged()).toBe(true);
    expect(rotated).toBe(1);
    expect(store.verifyMaster(oldMaster)).toBe(false);
    expect(store.generation()).not.toBe(oldGeneration);
  });

  it('writeFileAtomic leaves no temp files and replaces content under concurrent writes', async () => {
    const target = join(paths.root, 'atomic.json');
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        writeFileAtomic(target, JSON.stringify({ i, pad: 'x'.repeat(2000) })),
      ),
    );
    expect(JSON.parse(await readFile(target, 'utf8'))).toMatchObject({ i: expect.any(Number) });
    const leftovers = (await readdir(paths.root)).filter((n) => n.endsWith('.tmp'));
    expect(leftovers).toEqual([]);
  });

  it('writeFileAtomic cleans its temp file when the write fails', async () => {
    const blocked = join(paths.root, 'dir-as-target');
    await mkdir(blocked);
    await writeFile(join(blocked, 'child'), 'x'); // target is a non-empty directory: rename must fail
    await expect(writeFileAtomic(blocked, 'data')).rejects.toBeTruthy();
    expect((await readdir(paths.root)).filter((n) => n.endsWith('.tmp'))).toEqual([]);
  });

  it('renameWithRetry retries transient Windows errors (EPERM/EBUSY/EACCES) and gives up on others', async () => {
    let calls = 0;
    const flaky = async () => {
      calls++;
      if (calls < 4)
        throw Object.assign(new Error('busy'), { code: calls % 2 ? 'EPERM' : 'EBUSY' });
    };
    await renameWithRetry('a', 'b', flaky, async () => undefined);
    expect(calls).toBe(4);

    calls = 0;
    const fatal = async () => {
      calls++;
      throw Object.assign(new Error('nope'), { code: 'ENOENT' });
    };
    await expect(renameWithRetry('a', 'b', fatal, async () => undefined)).rejects.toThrow('nope');
    expect(calls).toBe(1);

    calls = 0;
    const always = async () => {
      calls++;
      throw Object.assign(new Error('locked'), { code: 'EPERM' });
    };
    await expect(renameWithRetry('a', 'b', always, async () => undefined)).rejects.toThrow(
      'locked',
    );
    expect(calls).toBe(10);
  });

  it('runtime.json: write/read/remove; removal is skipped when another process owns it', async () => {
    await writeRuntimeInfo(paths, { pid: 4242, port: 3200, startedAt: 1, version: '1.0.0' });
    expect(await readRuntimeInfo(paths)).toEqual({
      pid: 4242,
      port: 3200,
      startedAt: 1,
      version: '1.0.0',
    });
    await removeRuntimeInfo(paths, 1111); // not the owner
    expect(await readRuntimeInfo(paths)).not.toBeNull();
    await removeRuntimeInfo(paths, 4242);
    expect(await readRuntimeInfo(paths)).toBeNull();
    await writeFile(paths.runtimeFile, '{broken');
    expect(await readRuntimeInfo(paths)).toBeNull(); // tolerant
    expect(isProcessAlive(process.pid)).toBe(true);
  });
});

describe('config (T-11)', () => {
  it('starts from defaults, tolerates invalid fields (keeps the rest) and never throws', async () => {
    await writeFile(
      paths.configFile,
      JSON.stringify({
        lang: 'en',
        quality: 'ultra',
        approvalDeadlineSec: 5,
        sound: true,
        junk: 1,
      }),
    );
    const store = new ConfigStore(paths);
    await store.load();
    expect(store.get()).toEqual({ ...DEFAULT_PUBLIC_CONFIG, lang: 'en', sound: true });
    expect(store.invalidFields.sort()).toEqual(['approvalDeadlineSec', 'quality']);

    await writeFile(paths.configFile, '{not json');
    await store.load();
    expect(store.get()).toEqual(DEFAULT_PUBLIC_CONFIG);
  });

  it('update merges chatMode per project and persists atomically', async () => {
    const store = new ConfigStore(paths);
    await store.load();
    await store.update({ chatMode: { Sites: 'automatic' } });
    await store.update({ lang: 'en', chatMode: { Outro: 'interactive' } });
    const reloaded = new ConfigStore(paths);
    await reloaded.load();
    expect(reloaded.get()).toMatchObject({
      lang: 'en',
      chatMode: { Sites: 'automatic', Outro: 'interactive' },
    });
  });

  it('environment: defaults, empty strings count as unset, bad values raise EnvError', () => {
    const env = loadServerEnv({
      ESCRITORIO_PORT: '',
      ESCRITORIO_HOME: '',
      CLAUDE_BIN: '',
    } as NodeJS.ProcessEnv);
    expect(env.port).toBe(3200);
    expect(env.paths.root).toMatch(/\.escritorio-equipe$/);
    expect(env.claudeBin).toBeUndefined();
    expect(
      loadServerEnv({ ESCRITORIO_PORT: '3333', ESCRITORIO_HOME: 'X:\\h' } as NodeJS.ProcessEnv)
        .port,
    ).toBe(3333);
    for (const port of ['0', '70000', 'abc', '3.5']) {
      expect(() => loadServerEnv({ ESCRITORIO_PORT: port } as NodeJS.ProcessEnv), port).toThrow(
        EnvError,
      );
    }
    expect(() => loadServerEnv({ ESCRITORIO_LOG_LEVEL: 'loud' } as NodeJS.ProcessEnv)).toThrow(
      EnvError,
    );
  });
});

describe('logging (T-11)', () => {
  it('CA-03: the sink scrubs known secrets and token-shaped values from every line', async () => {
    const secret = 'S'.repeat(43);
    const sink = new LogSink({ logsDir: paths.logsDir, secrets: () => [secret] });
    const bearer = 'Bearer ' + 'b'.repeat(43);
    sink.write(
      `{"msg":"leak ${secret} and ${bearer} and esc_sid=${'c'.repeat(43)} and ?ticket=${'d'.repeat(22)}"}\n`,
    );
    const [file] = await readdir(paths.logsDir);
    const text = await readFile(join(paths.logsDir, file!), 'utf8');
    expect(text).not.toContain(secret);
    expect(text).not.toContain('b'.repeat(43));
    expect(text).not.toContain('c'.repeat(43));
    expect(text).not.toContain('d'.repeat(22));
    expect(text).toContain('[redacted]');
  });

  it('prunes daily logs older than 7 days and ignores other files', async () => {
    const now = new Date(2026, 10, 13);
    const day = (offset: number) => {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset);
      const p = (n: number) => String(n).padStart(2, '0');
      return `escritorio-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.log`;
    };
    for (const name of [day(0), day(6), day(7), day(8), day(30), 'server-stdout.log', 'hook.log']) {
      await writeFile(join(paths.logsDir, name), 'x');
      await utimes(join(paths.logsDir, name), now, now);
    }
    pruneOldLogs(paths.logsDir, now);
    expect((await readdir(paths.logsDir)).sort()).toEqual(
      [day(0), day(6), day(7), 'hook.log', 'server-stdout.log'].sort(),
    );
    expect((await stat(join(paths.logsDir, day(0)))).isFile()).toBe(true);
  });

  it('pathOnly drops the query string (a ticket must never be logged with the URL)', () => {
    expect(pathOnly('/auth/callback?ticket=abc')).toBe('/auth/callback');
    expect(pathOnly('/api/health')).toBe('/api/health');
    expect(pathOnly(undefined)).toBe('');
  });
});

describe('server i18n (CA-10 style parity)', () => {
  it('pt-BR and en have the same keys and the same placeholders', () => {
    const { 'pt-BR': pt, en } = allDictionaries();
    expect(Object.keys(en).sort()).toEqual(Object.keys(pt).sort());
    const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const key of Object.keys(pt) as Array<keyof typeof pt>) {
      expect(placeholders(en[key]), key).toEqual(placeholders(pt[key]));
      expect(en[key].length, key).toBeGreaterThan(0);
    }
  });

  it('interpolates parameters, falls back to pt-BR for unknown languages', () => {
    expect(t('pt-BR', 'server.started', { port: 3200 })).toContain('http://127.0.0.1:3200');
    expect(t('en', 'cli.notRunning')).toBe('The Office is not running.');
    expect(resolveLang('en-US')).toBe('en');
    expect(resolveLang('fr')).toBe('pt-BR');
    expect(resolveLang(undefined)).toBe('pt-BR');
  });
});
