import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  AuthCallbackQuerySchema,
  type AuthTicketResponseSchema,
  type HealthResponseSchema,
  type SessionResponseSchema,
} from '../../../shared/contracts';
import type { z } from 'zod';
import type { TokenStore } from '../../home/tokens';
import { safeEqual } from '../../home/tokens';
import type { Lang, MessageKey } from '../../i18n';
import { sendError } from '../errors';
import type { NetContext } from '../net';
import { render401Page } from './page401';
import { SESSION_COOKIE, SESSION_TTL_MS, type SessionStore } from './sessions';
import type { TicketStore } from './tickets';
import './types';

export interface RateLimits {
  /** Requests per minute for API/auth/ws routes (static files are not limited). */
  general: number;
  /** `/auth/*` and `/api/auth/*` (ADR-0005: 10/min). */
  auth: number;
  /** `/api/health` (polled by the launcher while the server boots). */
  health: number;
  /** State-changing requests per session (ARQUITETURA §5.5: 30/min). */
  actions: number;
}

export const DEFAULT_RATE_LIMITS: RateLimits = { general: 120, auth: 10, health: 600, actions: 30 };

export interface AuthDeps {
  tokens: TokenStore;
  tickets: TicketStore;
  sessions: SessionStore;
  net: NetContext;
  getLang: () => Lang;
  version: string;
  limits: RateLimits;
  onShutdownRequest: () => void;
  now?: () => number;
}

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const BEARER = /^Bearer ([A-Za-z0-9._~+/=-]{16,512})$/;

function deny(
  request: FastifyRequest,
  reply: FastifyReply,
  deps: AuthDeps,
  status: 401 | 403,
  reason: string,
) {
  // Reason is a fixed label, never a credential or request content.
  request.log.warn({ reason, path: request.url.split('?')[0], status }, 'auth denied');
  const lang = deps.getLang();
  if (status === 401 && !request.url.startsWith('/api/')) {
    return reply.code(401).type('text/html; charset=utf-8').send(render401Page());
  }
  const key: MessageKey = status === 401 ? 'error.unauthorized' : 'error.forbidden';
  return sendError(reply, lang, status, status === 401 ? 'unauthorized' : 'forbidden', key);
}

function setSessionCookie(reply: FastifyReply, id: string) {
  reply.setCookie(SESSION_COOKIE, id, {
    httpOnly: true,
    sameSite: 'strict',
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  });
}

function bearerOf(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  const match = typeof header === 'string' ? BEARER.exec(header) : null;
  return match?.[1] ?? null;
}

/** Auth hook + the auth/session/health/shutdown routes (T-13). */
export function registerAuth(app: FastifyInstance, deps: AuthDeps): void {
  const now = deps.now ?? (() => Date.now());
  const actionHits = new Map<string, number[]>();
  let lastTokenCheck = 0;

  app.decorateRequest('escSession', null);

  const actionAllowed = (key: string): boolean => {
    const t = now();
    const hits = (actionHits.get(key) ?? []).filter((h) => t - h < 60_000);
    if (hits.length >= deps.limits.actions) {
      actionHits.set(key, hits);
      return false;
    }
    hits.push(t);
    actionHits.set(key, hits);
    return true;
  };

  app.addHook('onRequest', async (request, reply) => {
    // Pick up `token:rotate` done by another process (at most once per second).
    if (now() - lastTokenCheck > 1000) {
      lastTokenCheck = now();
      await deps.tokens.reloadIfChanged().catch(() => false);
    }

    const mode = request.routeOptions.config?.auth ?? 'session';
    if (mode === 'public') return undefined;

    const origin = request.headers.origin;

    if (mode === 'bearer' || mode === 'hook') {
      if (origin !== undefined) return deny(request, reply, deps, 403, 'origin-not-allowed');
      const candidate = bearerOf(request);
      const ok =
        candidate !== null &&
        (mode === 'bearer'
          ? deps.tokens.verifyMaster(candidate)
          : deps.tokens.verifyHook(candidate));
      return ok ? undefined : deny(request, reply, deps, 401, 'bad-token');
    }

    if (mode === 'bearer-or-session' && request.headers.authorization !== undefined) {
      if (origin !== undefined) return deny(request, reply, deps, 403, 'origin-not-allowed');
      const candidate = bearerOf(request);
      return candidate !== null && deps.tokens.verifyMaster(candidate)
        ? undefined
        : deny(request, reply, deps, 401, 'bad-token');
    }

    // Session-cookie modes.
    const failStatus = mode === 'ws' ? 403 : 401;
    if (mode === 'ws' && !deps.net.isAllowedOrigin(origin)) {
      return deny(request, reply, deps, 403, 'ws-origin');
    }
    if (origin !== undefined && !deps.net.isAllowedOrigin(origin)) {
      return deny(request, reply, deps, 403, 'origin-not-allowed');
    }
    const session = deps.sessions.lookup(request.cookies[SESSION_COOKIE]);
    if (!session) return deny(request, reply, deps, failStatus, 'no-session');

    if (UNSAFE_METHODS.has(request.method)) {
      if (!deps.net.isAllowedOrigin(origin)) {
        return deny(request, reply, deps, 403, 'origin-required');
      }
      const csrf = request.headers['x-escritorio-csrf'];
      if (typeof csrf !== 'string' || !safeEqual(csrf, session.csrf)) {
        return deny(request, reply, deps, 403, 'csrf');
      }
      if (!actionAllowed(deps.sessions.keyOf(session.id))) {
        return sendError(reply, deps.getLang(), 429, 'rate_limited', 'error.rateLimited');
      }
    }

    request.escSession = {
      id: session.id,
      key: deps.sessions.keyOf(session.id),
      csrf: session.csrf,
    };
    if (session.refreshCookie) setSessionCookie(reply, session.id);
    return undefined;
  });

  // --- Routes ---

  /** Ticket -> cookie. The ticket in the URL is already dead when the browser shows the page. */
  app.get(
    '/auth/callback',
    { config: { auth: 'public', rateLimit: { max: deps.limits.auth, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const query = AuthCallbackQuerySchema.safeParse(request.query);
      if (!query.success || !deps.tickets.consume(query.data.ticket)) {
        return deny(request, reply, deps, 401, 'bad-ticket');
      }
      const session = deps.sessions.create();
      setSessionCookie(reply, session.id);
      return reply.code(303).header('Location', '/').send();
    },
  );

  app.post(
    '/api/auth/ticket',
    { config: { auth: 'bearer', rateLimit: { max: deps.limits.auth, timeWindow: '1 minute' } } },
    async (): Promise<z.infer<typeof AuthTicketResponseSchema>> => deps.tickets.issue(),
  );

  app.get(
    '/api/health',
    {
      config: {
        auth: 'bearer-or-session',
        rateLimit: { max: deps.limits.health, timeWindow: '1 minute' },
      },
    },
    async (): Promise<z.infer<typeof HealthResponseSchema>> => ({
      ok: true,
      version: deps.version,
    }),
  );

  app.get('/api/session', async (request): Promise<z.infer<typeof SessionResponseSchema>> => ({
    csrfToken: request.escSession?.csrf ?? '',
    lang: deps.getLang(),
  }));

  /** Graceful stop for `escritorio stop` (Windows has no SIGTERM for a detached process). */
  app.post('/api/admin/shutdown', { config: { auth: 'bearer' } }, async (_request, reply) => {
    reply.code(202);
    setImmediate(deps.onShutdownRequest);
    return { ok: true };
  });
}
