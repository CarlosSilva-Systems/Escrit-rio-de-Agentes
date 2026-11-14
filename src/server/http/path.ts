/**
 * Path of a request URL as the router will see it: query dropped, dot segments resolved and
 * percent-escapes decoded. Security decisions made on the raw string (rate-limit allowList,
 * `no-store`, logging) must use this, otherwise `/%61uth/callback` would dodge a check written
 * for `/auth/callback`. A malformed escape keeps the undecoded text (the router 400s it anyway).
 */
export function normalizeRequestPath(url: string): string {
  let path = url.split('?')[0]?.split('#')[0] ?? '';
  try {
    path = new URL(path, 'http://localhost').pathname;
  } catch {
    /* keep the raw path */
  }
  try {
    path = decodeURIComponent(path);
  } catch {
    /* malformed escape: keep as is */
  }
  return path.replace(/\/{2,}/g, '/');
}

export const isApiLikePath = (path: string): boolean =>
  path.startsWith('/api/') || path.startsWith('/auth/') || path.startsWith('/ws');
