import { execFile } from 'node:child_process';

/** The only address the server ever binds. Hard-coded on purpose: there is no host option. */
export const LOOPBACK_HOST = '127.0.0.1' as const;

/**
 * Port-dependent allowlists. The port is only known after `listen` when an ephemeral port
 * (tests) is used, so the context is mutable.
 */
export class NetContext {
  constructor(public port: number) {}

  allowedHosts(): string[] {
    return [`127.0.0.1:${this.port}`, `localhost:${this.port}`];
  }

  allowedOrigins(): string[] {
    return [`http://127.0.0.1:${this.port}`, `http://localhost:${this.port}`];
  }

  isAllowedHost(host: string | undefined): boolean {
    return host !== undefined && this.allowedHosts().includes(host.toLowerCase());
  }

  isAllowedOrigin(origin: string | undefined): boolean {
    return origin !== undefined && this.allowedOrigins().includes(origin);
  }
}

export interface PortOwner {
  pid: number;
  name: string | null;
}

function run(file: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    execFile(
      file,
      args,
      { windowsHide: true, shell: false, timeout: 8000, maxBuffer: 4 * 1024 * 1024 },
      (error, stdout) => resolve(error ? '' : stdout),
    );
  });
}

/** Best effort: who listens on `port` (Windows `netstat` + `tasklist`; `null` if unknown). */
export async function findPortOwner(port: number): Promise<PortOwner | null> {
  if (process.platform !== 'win32') return null;
  const netstat = await run('netstat.exe', ['-ano', '-p', 'TCP']);
  const wanted = new RegExp(`^\\s*TCP\\s+\\S+:${port}\\s+\\S+\\s+LISTENING\\s+(\\d+)\\s*$`, 'im');
  const pid = Number(wanted.exec(netstat)?.[1]);
  if (!Number.isInteger(pid) || pid <= 0) return null;
  const tasks = await run('tasklist.exe', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH']);
  const name = /^"([^"]+)"/.exec(tasks.trim())?.[1] ?? null;
  return { pid, name };
}
