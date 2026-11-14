import type { FastifyInstance } from 'fastify';
import type { NetContext } from '../net';

/** Content-Security-Policy of ADR-0005 for the given port. */
export function buildCsp(port: number): string {
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data: blob:",
    `connect-src 'self' ws://127.0.0.1:${port} ws://localhost:${port}`,
    "font-src 'self'",
    "media-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join('; ');
}

/**
 * Security headers on EVERY response (including errors and 401/403 pages). No CORS headers
 * exist anywhere: the app is same-origin only. API and auth responses are never cached.
 */
export function registerSecurityHeaders(app: FastifyInstance, net: NetContext) {
  app.addHook('onRequest', async (request, reply) => {
    reply.header('Content-Security-Policy', buildCsp(net.port));
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Cross-Origin-Opener-Policy', 'same-origin');
    reply.header('Cross-Origin-Resource-Policy', 'same-origin');
    const path = request.url;
    if (path.startsWith('/api/') || path.startsWith('/auth/')) {
      reply.header('Cache-Control', 'no-store');
    }
  });
}
