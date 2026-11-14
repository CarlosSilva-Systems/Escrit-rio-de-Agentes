import type { FastifyInstance } from 'fastify';
import type { IngestService } from '../../ingest';

// `POST /api/hooks/v1/claude` (ADR-0004 §2): only the hook token, no Origin (the auth hook
// enforces both through `config.auth = 'hook'`). Observational: the answer is always empty.
// - 204: accepted, duplicate or an event we do not use.
// - 202: the body was not usable (not JSON / wrong shape); counted as `ingest.invalid`.
//   Never a 4xx for content problems, so the hook has nothing to log.
// The body is parsed by a tolerant parser (bad JSON becomes `undefined`) so the error handler
// never sees, and therefore never logs, a fragment of the payload.

export const HOOK_BODY_LIMIT = 1024 * 1024;
/** Hook traffic has its own, higher budget so it never starves (or is starved by) the browser. */
export const HOOK_RATE_LIMIT_PER_MIN = 6000;

export async function registerHookRoutes(
  app: FastifyInstance,
  deps: { ingest: IngestService },
): Promise<void> {
  await app.register(async (scope) => {
    scope.removeAllContentTypeParsers();
    scope.addContentTypeParser(
      '*',
      { parseAs: 'string', bodyLimit: HOOK_BODY_LIMIT },
      (_request, body, done) => {
        try {
          done(null, JSON.parse(body as string));
        } catch {
          done(null, undefined);
        }
      },
    );

    scope.post(
      '/api/hooks/v1/claude',
      {
        bodyLimit: HOOK_BODY_LIMIT,
        config: {
          auth: 'hook',
          rateLimit: { max: HOOK_RATE_LIMIT_PER_MIN, timeWindow: '1 minute' },
        },
      },
      async (request, reply) => {
        const outcome = deps.ingest.ingestHook(request.body);
        return reply.code(outcome === 'invalid' ? 202 : 204).send();
      },
    );
  });
}
