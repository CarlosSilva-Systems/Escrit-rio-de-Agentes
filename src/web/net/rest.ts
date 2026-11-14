// REST client (ADR-0005): cookie session (same-origin, automatic), CSRF header on every state-changing
// request. The browser only ever sends validated, closed-list bodies: no paths, commands or env.

import {
  ConfigPatchSchema,
  DiagResponseSchema,
  NpcHistoryResponseSchema,
  SessionResponseSchema,
  type ActivityItem,
  type ConfigPatch,
} from '../../shared/contracts';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`HTTP ${status} ${code}`);
    this.name = 'ApiError';
  }
}

export interface SessionInfo {
  csrfToken: string;
  lang: 'pt-BR' | 'en';
}

export interface Api {
  getSession(): Promise<SessionInfo>;
  /** PATCH /api/config with a closed-list body (strict). */
  patchConfig(patch: ConfigPatch): Promise<void>;
  /** GET /api/npcs/:key/history: newest first, 10-50 items, metadata only. */
  getNpcHistory(key: string): Promise<ActivityItem[]>;
  /** GET /api/diag: counters only, never content. */
  getDiag(): Promise<Record<string, number>>;
}

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

const CSRF_HEADER = 'X-Escritorio-CSRF';

export function createApi(fetchFn: FetchFn = (i, init) => fetch(i, init)): Api {
  let csrfToken: string | null = null;

  const errorFrom = async (res: Response): Promise<ApiError> => {
    let code = 'error';
    try {
      const body = (await res.json()) as { error?: { code?: unknown } };
      if (typeof body.error?.code === 'string') code = body.error.code.slice(0, 64);
    } catch {
      // Not JSON (static "abra pelo atalho" page): the status alone tells the story.
    }
    return new ApiError(res.status, code);
  };

  const request = async (
    method: 'GET' | 'PATCH',
    path: string,
    body?: unknown,
  ): Promise<Response> => {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (method !== 'GET') {
      if (!csrfToken) throw new ApiError(0, 'no-csrf');
      headers[CSRF_HEADER] = csrfToken;
      headers['content-type'] = 'application/json';
    }
    const res = await fetchFn(path, {
      method,
      headers,
      credentials: 'same-origin',
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) throw await errorFrom(res);
    return res;
  };

  return {
    async getSession() {
      const res = await request('GET', '/api/session');
      const parsed = SessionResponseSchema.safeParse(await res.json());
      if (!parsed.success) throw new ApiError(res.status, 'bad-session');
      csrfToken = parsed.data.csrfToken;
      return { csrfToken: parsed.data.csrfToken, lang: parsed.data.lang };
    },
    async getDiag() {
      const res = await request('GET', '/api/diag');
      const parsed = DiagResponseSchema.safeParse(await res.json());
      if (!parsed.success) throw new ApiError(res.status, 'bad-diag');
      return parsed.data.counters;
    },
    async getNpcHistory(key) {
      const res = await request('GET', `/api/npcs/${encodeURIComponent(key)}/history`);
      const parsed = NpcHistoryResponseSchema.safeParse(await res.json());
      if (!parsed.success) throw new ApiError(res.status, 'bad-history');
      return parsed.data.items;
    },
    async patchConfig(patch) {
      // Validate before sending: an invalid patch is a programming error, not a network error.
      const body = ConfigPatchSchema.parse(patch);
      await request('PATCH', '/api/config', body);
    },
  };
}
