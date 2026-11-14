import type { FastifyInstance } from 'fastify';
import { ConfigPatchSchema, type PublicConfig } from '../../../shared/contracts';
import type { ConfigStore } from '../../config';
import { ApiError } from '../errors';

// `GET/PATCH /api/config` (ARQUITETURA §5.5). Session cookie required; PATCH also needs the exact
// Origin and the CSRF header and counts against the per-session action limit (auth hook).
// The body is a STRICT closed list (unknown fields -> 400); the result is persisted atomically
// by the ConfigStore and the full updated PublicConfig is returned. Server messages follow the
// saved language immediately (`getLang` reads the store on every request).

export function registerConfigRoutes(app: FastifyInstance, deps: { config: ConfigStore }): void {
  app.get('/api/config', async (): Promise<PublicConfig> => deps.config.get());

  app.patch('/api/config', async (request): Promise<PublicConfig> => {
    const parsed = ConfigPatchSchema.safeParse(request.body);
    if (!parsed.success) throw new ApiError(400, 'invalid_request', 'error.invalidRequest');
    return deps.config.update(parsed.data);
  });
}
