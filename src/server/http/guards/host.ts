import type { FastifyInstance } from 'fastify';
import type { Lang } from '../../i18n';
import { sendError } from '../errors';
import type { NetContext } from '../net';

/**
 * DNS-rebinding guard (ADR-0005): the Host header must be exactly `127.0.0.1:<port>` or
 * `localhost:<port>`. Runs first, before routing, auth and rate limiting.
 */
export function registerHostGuard(app: FastifyInstance, net: NetContext, getLang: () => Lang) {
  app.addHook('onRequest', async (request, reply) => {
    if (!net.isAllowedHost(request.headers.host)) {
      request.log.warn({ path: request.url.split('?')[0] }, 'host rejected');
      return sendError(reply, getLang(), 403, 'forbidden', 'error.forbidden');
    }
    return undefined;
  });
}
