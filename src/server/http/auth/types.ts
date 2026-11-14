import 'fastify';

/**
 * How a route authenticates (set per route with `config: { auth }`, default `session`):
 * - `session`: cookie `esc_sid`; unsafe methods also need exact `Origin` + `X-Escritorio-CSRF`.
 * - `public`: no credentials (only `/auth/callback`).
 * - `bearer`: master token in `Authorization: Bearer`, and NO `Origin` header (local clients).
 * - `bearer-or-session`: master Bearer if an Authorization header is sent, else the cookie.
 * - `hook`: hook token in `Authorization: Bearer`, NO `Origin` header (Claude Code hooks).
 * - `ws`: WebSocket upgrade: exact `Origin` required + valid cookie, otherwise 403.
 */
export type AuthMode = 'session' | 'public' | 'bearer' | 'bearer-or-session' | 'hook' | 'ws';

declare module 'fastify' {
  interface FastifyContextConfig {
    auth?: AuthMode;
  }
  interface FastifyRequest {
    /** Set by the auth hook on session-authenticated requests. */
    escSession: { id: string; key: string; csrf: string } | null;
  }
}
