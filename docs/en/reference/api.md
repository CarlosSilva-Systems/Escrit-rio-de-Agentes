# Reference: REST and WebSocket routes

[🇧🇷 Português](../../pt-BR/reference/api.md) · [Documentation index](../README.md)

This is the interface between the server (`127.0.0.1:<port>`), the browser, the CLI and the hook. It lists what exists in Phase 1. Exact shapes are in the zod contracts (`src/shared/contracts/`) and the generated schemas `schemas/rest.v1.schema.json` and `schemas/events.v1.schema.json`. Secrets are never shown here.

## Access modes

| Mode | Credential | Used by |
|---|---|---|
| `public` | none | ticket callback, identity proof |
| `bearer` | `Authorization: Bearer <master token>`, no `Origin` header | CLI |
| `session` | cookie `esc_sid` (`HttpOnly`, `SameSite=Strict`) | browser |
| `hook` | `Authorization: Bearer <hook token>`, no `Origin` header | hook script |

Every request must carry the exact `Host` (`127.0.0.1:<port>` or `localhost:<port>`). There is no CORS. Changing requests (POST, PUT, PATCH, DELETE) from the browser also need the exact `Origin` and the header `X-Escritorio-CSRF` with the value from `GET /api/session`. API and auth responses are sent with `Cache-Control: no-store`. Errors are `{"error":{"code":"…","message":"…"}}` in the configured language: `401` unauthorized, `403` refused, `404`, `413` body too large, `429` rate limited, `500`.

## HTTP routes

| Method and route | Access | Purpose |
|---|---|---|
| `GET /auth/callback?ticket=<t>` | public | Trades a single-use ticket for the session cookie, answers `303` to `/`. Invalid or used ticket: `401` page. |
| `POST /api/auth/ticket` | bearer | Issues a ticket: `{ticket, expiresInSec: 60}`. |
| `GET /api/health` | bearer or session | `{ok: true, version}`. |
| `GET /api/health/proof?n=<nonce>&k=master\|hook` | public | `{proof}`: HMAC-SHA256 of the nonce keyed by the token, so clients can verify the server's identity before sending a credential. |
| `POST /api/auth/logout` | session + CSRF | Forgets the session, expires the cookie, closes its sockets (`204`). No button uses it yet. |
| `GET /api/session` | session | `{csrfToken, lang}`. |
| `POST /api/admin/shutdown` | bearer | Graceful stop for `escritorio stop` (`202`). |
| `GET /api/state` | session | `OfficeSnapshot`: team, NPCs, approvals, projects, activity (last 200), public config, diagnostics. |
| `GET /api/npcs/:key/history` | session | Latest activities of one NPC, newest first (metadata only). `400` for a malformed key, `404` for an unknown NPC. |
| `GET /api/diag` | session | Counters only (never content), for example `ingest.accepted`, `ingest.invalid`, `jsonl.events`. |
| `POST /api/hooks/v1/claude` | hook | Receives a hook payload. `204`: accepted, duplicate or ignored event. `202`: unusable body (counted as `ingest.invalid`). Never a 4xx for content problems. Body up to 1 MB. |
| static files | session | The web app from `dist/web`. |

Planned for later phases and **not implemented yet**: `PATCH /api/config` (the browser calls it when you change language or sound, and ignores a failure; the language is kept in the browser's `localStorage`), projects, chat, approvals, plan, usage and tokens routes.

### Limits

| Limit | Value |
|---|---|
| Request body | 64 kB (hook route: 1 MB) |
| General API rate | 120 requests per minute per session (anonymous: per address) |
| `/auth/*` and `/api/auth/*` | 10 per minute |
| State-changing requests | 30 per minute per session |
| `/api/health` | 600 per minute |
| `/api/health/proof` and the hook route | 6000 per minute |
| Ticket lifetime | 60 s, single use |
| Browser session | 8 h of inactivity, 24 h at most |

## WebSocket `/ws`

Authenticated by the session cookie plus exact `Origin` and `Host` during the upgrade (otherwise `403`). The server sends a full `snapshot` on connect and then messages grouped every 100 ms at most as `{"t":"batch","items":[…]}`.

Server to client (`t`): `hello`, `snapshot`, `npc.update`, `npc.remove`, `activity`, `team`, `diag`, and, defined for later phases, `approval.upsert`, `approval.remove`, `project.upsert`, `rooms`, `plan.update`, `usage`, `tokens`, `chat.session`, `chat.items`, `alert`.

Client to server: only `{"t":"ping"}` (strict schema; other frames are ignored).

| Close code | Reason |
|---|---|
| `1008` | More than 50 messages in one second |
| `1013` | More than 20 simultaneous clients |
| `4401` | Session logged out or invalidated (token rotation) |

Frames from the client are limited to 1 KiB. A client that cannot keep up (more than 4 MB buffered) is dropped and reconnects with a fresh snapshot.

## Related

- [Contracts](contracts.md)
- [Local security model](../explanation/security.md)
