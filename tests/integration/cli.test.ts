import { execFile } from 'node:child_process';
import { access, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from '../../scripts/build-server.mjs';
import { freePort, rawRequest } from './helpers/server';

const execFileAsync = promisify(execFile);
const root = fileURLToPath(new URL('../..', import.meta.url));
const cliFile = join(root, 'dist', 'cli.js');
const serverFile = join(root, 'dist', 'server', 'index.js');
const batFile = join(root, 'scripts', 'abrir-escritorio-dev.bat');

interface Result {
  code: number;
  stdout: string;
  stderr: string;
}

function run(file: string, args: string[], env: NodeJS.ProcessEnv, extra = {}): Promise<Result> {
  return new Promise((resolve) => {
    execFile(
      file,
      args,
      { env, windowsHide: true, shell: false, timeout: 60_000, ...extra },
      (error, stdout, stderr) => {
        const code = error ? (typeof error.code === 'number' ? error.code : 1) : 0;
        resolve({ code, stdout: String(stdout), stderr: String(stderr) });
      },
    );
  });
}

/** Command lines of node.exe processes running our compiled server entry. */
async function serverProcesses(): Promise<Array<{ pid: number; commandLine: string }>> {
  if (process.platform !== 'win32') return [];
  const script =
    'Get-CimInstance Win32_Process -Filter "Name=\'node.exe\'" | ForEach-Object { "$($_.ProcessId)|$($_.CommandLine)" }';
  const { stdout } = await execFileAsync('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    script,
  ]);
  return stdout
    .split(/\r?\n/)
    .filter((l) => l.toLowerCase().includes(serverFile.toLowerCase()))
    .map((l) => ({ pid: Number(l.split('|')[0]), commandLine: l.slice(l.indexOf('|') + 1) }));
}

const urlOf = (stdout: string) =>
  /(http:\/\/127\.0\.0\.1:\d+\/auth\/callback\?ticket=[\w-]+)/.exec(stdout)?.[1] ?? '';

describe('CLI and launchers (T-15)', () => {
  let home: string;
  let port: number;
  let env: NodeJS.ProcessEnv;
  const cli = (...args: string[]) => run(process.execPath, [cliFile, ...args], env);
  const readToken = async () => (await readFile(join(home, 'token'), 'utf8')).trim();

  beforeAll(async () => {
    await buildServer();
    home = await mkdtemp(join(tmpdir(), 'escritorio-cli-'));
    port = await freePort();
    env = {
      ...process.env,
      ESCRITORIO_HOME: home,
      ESCRITORIO_PORT: String(port),
      ESCRITORIO_NO_BROWSER: '1',
    };
  }, 60_000);

  afterAll(async () => {
    await cli('stop');
    // Safety net: only the PID this test's own runtime.json recorded (never other servers).
    try {
      const runtime = JSON.parse(await readFile(join(home, 'runtime.json'), 'utf8')) as {
        pid: number;
      };
      process.kill(runtime.pid);
    } catch {
      /* already stopped */
    }
    await rm(home, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }, 60_000);

  it('CA-83: status is "not running" (exit 1) while the server is down', async () => {
    const res = await cli('status');
    expect(res.code).toBe(1);
    expect(res.stdout).toContain('não está ligado');
  });

  it('CA-83/84: "open" starts the server and prints a single-use ticket URL that logs the browser in', async () => {
    const res = await cli('open');
    expect(res.code, res.stderr).toBe(0);
    expect(res.stdout).toContain('Ligando o Escritório');
    const url = urlOf(res.stdout);
    expect(url).toMatch(new RegExp(`^http://127\\.0\\.0\\.1:${port}/auth/callback\\?ticket=`));

    // The long-lived token is never in the URL or in any output.
    const token = await readToken();
    expect(res.stdout + res.stderr).not.toContain(token);

    const cb = await rawRequest(port, { path: new URL(url).pathname + new URL(url).search });
    expect(cb.status).toBe(303);
    const cookie = cb.headers['set-cookie']?.[0]?.split(';')[0] ?? '';
    const session = await rawRequest(port, { path: '/api/session', headers: { cookie } });
    expect(session.status).toBe(200);
    // The same URL cannot be used twice.
    expect(
      (await rawRequest(port, { path: new URL(url).pathname + new URL(url).search })).status,
    ).toBe(401);
  });

  it('CA-84: the server process has no token in its command line; only 127.0.0.1 listens', async () => {
    const token = await readToken();
    const procs = await serverProcesses();
    expect(procs).toHaveLength(1);
    expect(procs[0]!.commandLine).not.toContain(token);
    expect(procs[0]!.commandLine).not.toContain(
      (await readFile(join(home, 'hook-token'), 'utf8')).trim(),
    );

    const { stdout } = await execFileAsync('netstat.exe', ['-ano', '-p', 'TCP']);
    const listeners = stdout
      .split(/\r?\n/)
      .filter((l) => /LISTENING/.test(l) && new RegExp(`:${port}\\s`).test(l));
    expect(listeners).toHaveLength(1);
    expect(listeners[0]).toMatch(/^\s*TCP\s+127\.0\.0\.1:/);
    expect(listeners[0]!.trim().endsWith(String(procs[0]!.pid))).toBe(true);
  });

  it('CA-83: "open" again only opens (same PID, no second server)', async () => {
    const before = (await serverProcesses())[0]!.pid;
    const res = await cli('open');
    expect(res.code, res.stderr).toBe(0);
    expect(res.stdout).toContain('já está ligado');
    expect(res.stdout).not.toContain('Ligando');
    expect(urlOf(res.stdout)).not.toBe('');
    const after = await serverProcesses();
    expect(after.map((p) => p.pid)).toEqual([before]);
    const status = await cli('status');
    expect(status.code).toBe(0);
    expect(status.stdout).toContain(`PID ${before}`);
  });

  it('CA-83: "stop" shuts the server down gracefully and frees the port and runtime.json', async () => {
    const res = await cli('stop');
    expect(res.code, res.stderr).toBe(0);
    expect(res.stdout).toContain('desligado');
    expect(await serverProcesses()).toHaveLength(0);
    await expect(access(join(home, 'runtime.json'))).rejects.toThrow();
    expect((await cli('status')).code).toBe(1);
    expect((await cli('stop')).stdout).toContain('não está ligado'); // idempotent
  });

  it('CA-83: running abrir-escritorio-dev.bat twice from cold leaves exactly one server', async () => {
    const batEnv = { ...env };
    const first = await run('cmd.exe', ['/d', '/c', batFile], batEnv);
    expect(first.code, first.stdout + first.stderr).toBe(0);
    expect(first.stdout).toContain('Ligando o Escritório');
    expect(urlOf(first.stdout)).not.toBe('');
    const pids = (await serverProcesses()).map((p) => p.pid);
    expect(pids).toHaveLength(1);

    const second = await run('cmd.exe', ['/d', '/c', batFile], batEnv);
    expect(second.code, second.stdout + second.stderr).toBe(0);
    expect(second.stdout).toContain('já está ligado');
    expect(urlOf(second.stdout)).not.toBe('');
    expect((await serverProcesses()).map((p) => p.pid)).toEqual(pids);
    expect(urlOf(first.stdout)).not.toBe(urlOf(second.stdout)); // a fresh ticket each time
  });

  it('token:rotate invalidates browser sessions and the next "open" works with the new token', async () => {
    const url = urlOf((await cli('open')).stdout);
    const cb = await rawRequest(port, { path: new URL(url).pathname + new URL(url).search });
    const cookie = cb.headers['set-cookie']?.[0]?.split(';')[0] ?? '';
    expect((await rawRequest(port, { path: '/api/session', headers: { cookie } })).status).toBe(
      200,
    );
    const oldToken = await readToken();

    const rotate = await cli('token:rotate');
    expect(rotate.code, rotate.stderr).toBe(0);
    expect(rotate.stdout).toContain('Tokens regenerados');
    expect(await readToken()).not.toBe(oldToken);

    let status = 200;
    for (let i = 0; i < 20 && status === 200; i++) {
      await new Promise((r) => setTimeout(r, 200));
      status = (await rawRequest(port, { path: '/api/session', headers: { cookie } })).status;
    }
    expect(status).toBe(401);

    const again = await cli('open');
    expect(again.code, again.stderr).toBe(0);
    const cb2 = await rawRequest(port, {
      path: new URL(urlOf(again.stdout)).pathname + new URL(urlOf(again.stdout)).search,
    });
    expect(cb2.status).toBe(303);
  });

  it('CA-03: no token, ticket or cookie value ever reaches the log files', async () => {
    const logsDir = join(home, 'logs');
    const logs = (
      await Promise.all((await readdir(logsDir)).map((f) => readFile(join(logsDir, f), 'utf8')))
    ).join('\n');
    expect(logs.length).toBeGreaterThan(50);
    expect(logs).not.toContain(await readToken());
    expect(logs).not.toContain((await readFile(join(home, 'hook-token'), 'utf8')).trim());
    expect(logs).not.toMatch(/ticket=[\w-]{16,}/);
    expect(logs).not.toMatch(/esc_sid=[\w-]{20,}/);
    await cli('stop');
  });

  it('CA-83: two simultaneous launchers from cold still end with exactly one server', async () => {
    expect(await serverProcesses()).toHaveLength(0);
    const [a, b] = await Promise.all([cli('start'), cli('start')]);
    expect(a.code, a.stderr).toBe(0);
    expect(b.code, b.stderr).toBe(0);
    expect(await serverProcesses()).toHaveLength(1);
    await cli('stop');
  });

  it('messages follow config.json lang (en)', async () => {
    await writeFile(join(home, 'config.json'), JSON.stringify({ lang: 'en' }));
    const res = await cli('status');
    expect(res.stdout).toContain('The Office is not running.');
    await rm(join(home, 'config.json'));
  });

  it('prints usage and fails on an unknown command', async () => {
    const res = await cli('frobnicate');
    expect(res.code).toBe(1);
    expect(res.stderr).toContain('Comando desconhecido: frobnicate');
    expect(res.stdout).toContain('token:rotate');
  });
});

describe('busy port (CA-02)', () => {
  let home: string;
  let port: number;
  let squatter: Server;
  const sockets = new Set<Socket>();
  let env: NodeJS.ProcessEnv;

  beforeAll(async () => {
    await buildServer();
    home = await mkdtemp(join(tmpdir(), 'escritorio-busy-'));
    port = await freePort();
    env = { ...process.env, ESCRITORIO_HOME: home, ESCRITORIO_PORT: String(port) };
    squatter = createServer((socket) => {
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
      socket.end();
    });
    await new Promise<void>((resolve) => squatter.listen(port, '127.0.0.1', resolve));
  }, 60_000);
  afterAll(async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve) => squatter.close(resolve));
    await rm(home, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });

  it('CA-02: the server exits with a clear message naming the port (and owner), never another port', async () => {
    const res = await run(process.execPath, [serverFile], env);
    expect(res.code).toBe(3);
    expect(res.stderr).toContain(`A porta ${port} já está em uso`);
    expect(res.stderr).toContain('nunca troca de porta');
    if (process.platform === 'win32') expect(res.stderr).toMatch(/processo node\.exe \(PID \d+\)/i);
    await expect(access(join(home, 'runtime.json'))).rejects.toThrow();
  });

  it('CA-02: English message with the same facts when config.json lang is en', async () => {
    await writeFile(join(home, 'config.json'), JSON.stringify({ lang: 'en' }));
    const res = await run(process.execPath, [serverFile], env);
    expect(res.code).toBe(3);
    expect(res.stderr).toContain(`Port ${port} is already in use`);
    await rm(join(home, 'config.json'));
  });

  it('CA-02: the launcher reports the failure (exit 1) instead of waiting 20 s or switching port', async () => {
    const started = Date.now();
    const res = await run(process.execPath, [cliFile, 'start'], env);
    expect(res.code).toBe(1);
    expect(Date.now() - started).toBeLessThan(15_000);
    expect(res.stderr).toContain(`A porta ${port} já está em uso`);
    expect(res.stderr).toContain('O servidor encerrou ao iniciar');
  });
});
