import { existsSync } from 'node:fs';
import { join } from 'node:path';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';
import { t, type Lang } from '../i18n';

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * Serves `dist/web` (behind the session auth hook: static files are not public either).
 * Without a web build, `/` shows a plain placeholder instead of failing the server.
 */
export async function registerStatic(
  app: FastifyInstance,
  webRoot: string | null,
  getLang: () => Lang,
): Promise<boolean> {
  if (webRoot && existsSync(join(webRoot, 'index.html'))) {
    await app.register(fastifyStatic, {
      root: webRoot,
      index: ['index.html'],
      dotfiles: 'ignore',
      wildcard: true,
    });
    return true;
  }
  app.get('/', async (_request, reply) => {
    const message = escapeHtml(t(getLang(), 'server.webMissing'));
    return reply
      .type('text/html; charset=utf-8')
      .send(
        `<!doctype html><html><head><meta charset="utf-8"><title>Escritório</title></head><body><p>${message}</p></body></html>`,
      );
  });
  return false;
}
