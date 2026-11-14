import type { FastifyInstance } from 'fastify';
import type { NpcHistoryResponseSchema } from '../../../shared/contracts';
import type { z } from 'zod';
import { ApiError } from '../errors';
import type { OfficeService } from '../../office/service';

// Read routes of the office state (session cookie required; no CSRF needed for GET).
// - GET /api/state                  OfficeSnapshot (same payload the WS sends on connect)
// - GET /api/npcs/:key/history      latest activities of one NPC, newest first (metadata only)
// - GET /api/diag                   counters, no content

const NPC_KEY_RE = /^[A-Za-z0-9._:@-]{1,160}$/;

export function registerStateRoutes(app: FastifyInstance, deps: { office: OfficeService }): void {
  const { office } = deps;

  app.get('/api/state', async () => office.snapshot());

  app.get<{ Params: { key: string } }>(
    '/api/npcs/:key/history',
    async (request): Promise<z.infer<typeof NpcHistoryResponseSchema>> => {
      const { key } = request.params;
      if (!NPC_KEY_RE.test(key)) throw new ApiError(400, 'invalid_request', 'error.invalidRequest');
      if (!office.state.hasNpc(key)) throw new ApiError(404, 'not_found', 'error.notFound');
      return { items: office.state.historyOf(key) };
    },
  );

  app.get('/api/diag', async () => office.diag());
}
