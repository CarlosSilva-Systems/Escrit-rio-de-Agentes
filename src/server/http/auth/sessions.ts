import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { readJsonTolerant, writeFileAtomic } from '../../home/fsAtomic';
import type { HomePaths } from '../../home/paths';
import type { TokenStore } from '../../home/tokens';
import { restrictToCurrentUser } from '../../home/acl';

export const SESSION_COOKIE = 'esc_sid';
/** Sliding idle window: refreshed by use, but never beyond SESSION_MAX_AGE_MS. */
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
/** Absolute ceiling since login (B3): the session dies after 24 h no matter how busy it is. */
export const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const PERSIST_DEBOUNCE_MS = 1000;
/** `lastSeen` is only refreshed (and persisted) when it is older than this. */
const TOUCH_GRANULARITY_MS = 60 * 1000;
const MAX_SESSIONS = 50;

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

const PersistedSchema = z.object({
  v: z.literal(1),
  generation: z.string(),
  sessions: z.array(
    z.object({ h: z.string().length(64), createdAt: z.number(), lastSeen: z.number() }),
  ),
});

interface SessionRecord {
  createdAt: number;
  lastSeen: number;
}

export interface SessionInfo {
  id: string;
  csrf: string;
  /** True when the cookie should be re-issued to slide its expiry. */
  refreshCookie: boolean;
}

/**
 * Browser sessions: random 256-bit ids, 8 h sliding idle expiry under a 24 h absolute cap, in memory + persisted as SHA-256
 * digests (the id itself is never stored). Bound to the master token generation: rotating the
 * token invalidates everything.
 */
export class SessionStore {
  private readonly sessions = new Map<string, SessionRecord>();
  private timer: NodeJS.Timeout | null = null;
  private lastCookieRefresh = new Map<string, number>();

  constructor(
    private readonly paths: HomePaths,
    private readonly tokens: TokenStore,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async load(): Promise<void> {
    this.sessions.clear();
    const parsed = PersistedSchema.safeParse(await readJsonTolerant(this.paths.sessionsFile));
    if (!parsed.success || parsed.data.generation !== this.tokens.generation()) return;
    for (const s of parsed.data.sessions) {
      if (this.alive(s)) {
        this.sessions.set(s.h, { createdAt: s.createdAt, lastSeen: s.lastSeen });
      }
    }
  }

  create(): { id: string; csrf: string } {
    this.purge();
    while (this.sessions.size >= MAX_SESSIONS) {
      const oldest = this.sessions.keys().next().value;
      if (oldest === undefined) break;
      this.sessions.delete(oldest);
    }
    const id = randomBytes(32).toString('base64url');
    const t = this.now();
    this.sessions.set(sha256(id), { createdAt: t, lastSeen: t });
    this.lastCookieRefresh.set(sha256(id), t);
    this.schedulePersist();
    return { id, csrf: this.tokens.csrfFor(id) };
  }

  /** Validates a cookie value and slides the expiry. `null` if unknown or expired. */
  lookup(cookie: string | undefined): SessionInfo | null {
    if (!cookie || !SESSION_ID_PATTERN.test(cookie)) return null;
    const key = sha256(cookie);
    const record = this.sessions.get(key);
    if (!record) return null;
    const t = this.now();
    if (!this.alive(record)) {
      this.sessions.delete(key);
      this.schedulePersist();
      return null;
    }
    if (t - record.lastSeen > TOUCH_GRANULARITY_MS) {
      record.lastSeen = t;
      this.schedulePersist();
    }
    const lastRefresh = this.lastCookieRefresh.get(key) ?? 0;
    const refreshCookie = t - lastRefresh > 60 * 60 * 1000;
    if (refreshCookie) this.lastCookieRefresh.set(key, t);
    return { id: cookie, csrf: this.tokens.csrfFor(cookie), refreshCookie };
  }

  /** Rate-limit key of a VALID session cookie, without sliding anything; `null` otherwise. */
  peekKey(cookie: string | undefined): string | null {
    if (!cookie || !SESSION_ID_PATTERN.test(cookie)) return null;
    const record = this.sessions.get(sha256(cookie));
    return record && this.alive(record) ? this.keyOf(cookie) : null;
  }

  /** Logout: forgets one session. Returns whether it existed. */
  remove(cookie: string | undefined): boolean {
    if (!cookie || !SESSION_ID_PATTERN.test(cookie)) return false;
    const key = sha256(cookie);
    this.lastCookieRefresh.delete(key);
    const existed = this.sessions.delete(key);
    if (existed) this.schedulePersist();
    return existed;
  }

  private alive(record: SessionRecord): boolean {
    const t = this.now();
    return record.lastSeen + SESSION_TTL_MS > t && record.createdAt + SESSION_MAX_AGE_MS > t;
  }

  /** Stable per-session key for rate limiting (never the raw id). */
  keyOf(id: string): string {
    return sha256(id).slice(0, 16);
  }

  clear(): void {
    this.sessions.clear();
    this.lastCookieRefresh.clear();
    this.schedulePersist();
  }

  size(): number {
    return this.sessions.size;
  }

  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.purge();
    const body = {
      v: 1,
      generation: this.tokens.generation(),
      sessions: [...this.sessions].map(([h, r]) => ({
        h,
        createdAt: r.createdAt,
        lastSeen: r.lastSeen,
      })),
    };
    await writeFileAtomic(this.paths.sessionsFile, `${JSON.stringify(body)}\n`, {
      beforeRename: async (temp) => {
        await restrictToCurrentUser(temp);
      },
    });
  }

  private schedulePersist(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush().catch(() => undefined);
    }, PERSIST_DEBOUNCE_MS);
    this.timer.unref();
  }

  private purge(): void {
    for (const [key, r] of this.sessions) {
      if (!this.alive(r)) {
        this.sessions.delete(key);
        this.lastCookieRefresh.delete(key);
      }
    }
  }
}
