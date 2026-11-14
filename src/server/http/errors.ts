import type { FastifyError, FastifyInstance, FastifyReply } from 'fastify';
import type { ErrorResponse } from '../../shared/contracts';
import { t, type Lang, type MessageKey } from '../i18n';

/** Error with an HTTP status and a stable code; the message comes from i18n. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly messageKey: MessageKey,
  ) {
    super(code);
    this.name = 'ApiError';
  }
}

export function errorBody(lang: Lang, code: string, key: MessageKey): ErrorResponse {
  return { error: { code, message: t(lang, key) } };
}

const STATUS_MAP: Record<number, { code: string; key: MessageKey }> = {
  400: { code: 'invalid_request', key: 'error.invalidRequest' },
  401: { code: 'unauthorized', key: 'error.unauthorized' },
  403: { code: 'forbidden', key: 'error.forbidden' },
  404: { code: 'not_found', key: 'error.notFound' },
  413: { code: 'payload_too_large', key: 'error.payloadTooLarge' },
  429: { code: 'rate_limited', key: 'error.rateLimited' },
};

/**
 * A rejected WebSocket upgrade must not leave its socket open: Node stops tracking the sockets of
 * upgrade requests, and @fastify/websocket only destroys them if its own onRequest hook ran
 * (ours reject earlier). Without this the connection would outlive the response and block close.
 */
function closeAfterResponse(reply: FastifyReply): void {
  reply.header('connection', 'close');
  const socket = reply.request.raw.socket;
  reply.raw.once('finish', () => {
    socket.end();
    setTimeout(() => socket.destroy(), 1000).unref();
  });
}

export function sendError(
  reply: FastifyReply,
  lang: Lang,
  status: number,
  code: string,
  key: MessageKey,
) {
  if (reply.request.headers.upgrade !== undefined) closeAfterResponse(reply);
  return reply
    .code(status)
    .type('application/json; charset=utf-8')
    .send(errorBody(lang, code, key));
}

/** Uniform error/404 handling: never a stack trace, never request content, to the client. */
export function registerErrorHandling(app: FastifyInstance, getLang: () => Lang): void {
  app.setErrorHandler((error: FastifyError | ApiError, request, reply) => {
    const lang = getLang();
    if (error instanceof ApiError) {
      return sendError(reply, lang, error.status, error.code, error.messageKey);
    }
    const status = typeof error.statusCode === 'number' ? error.statusCode : 500;
    const mapped = STATUS_MAP[status];
    if (mapped && status < 500) {
      return sendError(reply, lang, status, mapped.code, mapped.key);
    }
    // Only code and message: the error object may carry request fragments.
    request.log.error(
      { errCode: (error as FastifyError).code, errMessage: error.message },
      'unhandled error',
    );
    return sendError(reply, lang, 500, 'internal_error', 'error.internal');
  });

  app.setNotFoundHandler((_request, reply) =>
    sendError(reply, getLang(), 404, 'not_found', 'error.notFound'),
  );
}
