import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { mkdir, stat } from 'node:fs/promises';
import { restrictToCurrentUser } from './acl';
import { readTextTolerant, writeFileAtomic } from './fsAtomic';
import type { HomePaths } from './paths';

/** 256 bits as base64url = 43 characters. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Constant-time comparison of two strings of any length (compares SHA-256 digests). */
export function safeEqual(a: string, b: string): boolean {
  const da = createHash('sha256').update(a).digest();
  const db = createHash('sha256').update(b).digest();
  return timingSafeEqual(da, db);
}

export interface TokenWriteResult {
  /** Files whose ACL could not be restricted (warning, not fatal). */
  aclFailures: string[];
}

async function writeSecretFile(file: string, token: string, result: TokenWriteResult) {
  await writeFileAtomic(file, `${token}\n`, {
    mode: 0o600,
    beforeRename: async (temp) => {
      const acl = await restrictToCurrentUser(temp);
      if (!acl.ok) result.aclFailures.push(file);
    },
  });
}

async function readToken(file: string): Promise<string | null> {
  const text = await readTextTolerant(file);
  const token = text?.trim() ?? '';
  return TOKEN_PATTERN.test(token) ? token : null;
}

/** Writes new master and hook tokens (used by `token:rotate`, also while the server runs). */
export async function rotateTokenFiles(paths: HomePaths): Promise<TokenWriteResult> {
  await mkdir(paths.root, { recursive: true });
  const result: TokenWriteResult = { aclFailures: [] };
  await writeSecretFile(paths.tokenFile, generateToken(), result);
  await writeSecretFile(paths.hookTokenFile, generateToken(), result);
  return result;
}

/** Reads the master token for local clients (the CLI). `null` if it does not exist yet. */
export async function readMasterToken(paths: HomePaths): Promise<string | null> {
  return readToken(paths.tokenFile);
}

/**
 * In-memory view of the two tokens. Created on first start; reloaded when the files change
 * (`token:rotate` runs in another process), which emits `rotated`.
 */
export class TokenStore extends EventEmitter {
  private master = '';
  private hook = '';
  private mtimes = { master: 0, hook: 0 };
  readonly aclFailures: string[] = [];

  private constructor(private readonly paths: HomePaths) {
    super();
  }

  static async load(paths: HomePaths): Promise<TokenStore> {
    await mkdir(paths.root, { recursive: true });
    const store = new TokenStore(paths);
    const result: TokenWriteResult = { aclFailures: [] };
    let master = await readToken(paths.tokenFile);
    if (!master) {
      master = generateToken();
      await writeSecretFile(paths.tokenFile, master, result);
    }
    let hook = await readToken(paths.hookTokenFile);
    if (!hook) {
      hook = generateToken();
      await writeSecretFile(paths.hookTokenFile, hook, result);
    }
    store.master = master;
    store.hook = hook;
    store.aclFailures.push(...result.aclFailures);
    store.mtimes = await store.readMtimes();
    return store;
  }

  private async readMtimes() {
    const m = await stat(this.paths.tokenFile).then(
      (s) => s.mtimeMs,
      () => 0,
    );
    const h = await stat(this.paths.hookTokenFile).then(
      (s) => s.mtimeMs,
      () => 0,
    );
    return { master: m, hook: h };
  }

  verifyMaster(candidate: string): boolean {
    return safeEqual(candidate, this.master);
  }

  verifyHook(candidate: string): boolean {
    return safeEqual(candidate, this.hook);
  }

  /** Changes whenever the master token changes: binds persisted sessions to it. */
  generation(): string {
    return createHash('sha256').update('gen:').update(this.master).digest('hex').slice(0, 16);
  }

  /** CSRF token of a session: HMAC(master, sid). Stateless, so it survives restarts. */
  csrfFor(sessionId: string): string {
    return createHmac('sha256', this.master).update(`csrf:${sessionId}`).digest('base64url');
  }

  /** Values the log scrubber must remove if they ever reach a log line. */
  secrets(): string[] {
    return [this.master, this.hook];
  }

  /** Re-reads the token files if they changed on disk. Returns true when the master changed. */
  async reloadIfChanged(): Promise<boolean> {
    const mtimes = await this.readMtimes();
    if (mtimes.master === this.mtimes.master && mtimes.hook === this.mtimes.hook) return false;
    this.mtimes = mtimes;
    const master = await readToken(this.paths.tokenFile);
    const hook = await readToken(this.paths.hookTokenFile);
    let masterChanged = false;
    if (master && master !== this.master) {
      this.master = master;
      masterChanged = true;
    }
    if (hook) this.hook = hook;
    if (masterChanged) this.emit('rotated');
    return masterChanged;
  }
}
