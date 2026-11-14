# Local security model

[🇧🇷 Português](../../pt-BR/explanation/security.md) · [Documentation index](../README.md)

Team Office runs on your PC and can, in later phases, send messages to Claude Code and approve its actions. So even though it is "just local", it is designed as if a hostile web page, or another program on the machine, were trying to use it. The decision record is [ADR-0005](../../adr/0005-local-security-model.md). This page explains the reasoning.

## What it defends against, and what it does not

| Threat | Defence |
|---|---|
| Someone on your network | The server binds `127.0.0.1` only. There is no host option, and a busy port is an error, never a fallback to another port. |
| A web page you visit that tries to call the server (CSRF, cross-site WebSocket, DNS rebinding) | Exact `Host` check, exact `Origin` check on actions and WebSocket upgrades, a CSRF header, `SameSite=Strict` cookie, no CORS headers at all. |
| A secret leaking through the URL, history, logs or screen | The long-lived token never goes to the browser. The URL carries only a single-use ticket that is already dead when the page loads. Logs redact tokens, cookies and tickets. |
| A rogue program squatting the port to steal a token | Clients ask the server to prove it knows the token before sending a credential (see below). |
| Hostile text in agent names, folder names or file contents | Shown as plain text, never as markup; strict Content-Security-Policy. |
| Brute force or floods | Rate limits, body size limits, a 20-client WebSocket cap, constant-time token comparison. |
| **Malware already running as your Windows user** | **Not defended.** It could read the token files. The files are restricted to your user, but a process with your rights is you. |

## How you get in: token, ticket, cookie

```mermaid
sequenceDiagram
  participant U as You
  participant C as CLI (open)
  participant S as Server
  participant B as Browser
  U->>C: npm run open
  C->>S: GET /api/health/proof (challenge)
  S-->>C: HMAC of my nonce, so I know it is the real server
  C->>S: POST /api/auth/ticket (Bearer master token)
  S-->>C: ticket, valid 60 s, single use
  C->>B: open /auth/callback?ticket=…
  B->>S: GET /auth/callback?ticket=…
  S-->>B: 303 to / and Set-Cookie esc_sid (HttpOnly, SameSite=Strict)
  Note over B,S: from now on only the cookie travels;<br/>actions also carry Origin and X-Escritorio-CSRF
```

Why three pieces instead of one password:

- **Master token** (a file, 256 random bits, user-only permissions): proves it is *you* running the CLI on this machine. It never leaves the CLI and the server.
- **Ticket** (single use, 60 s): lets the CLI hand access to a browser without putting a secret in an address bar, where it would be saved in history, visible on screen and sent to extensions. It is useless a second later.
- **Session cookie** (`HttpOnly`, so page scripts cannot read it; `SameSite=Strict`, so other sites cannot make the browser send it): keeps you signed in for up to 8 hours idle or 24 hours in total. Only a hash of it is stored on disk.
- **CSRF header and exact Origin** on every action: even if a cookie were somehow sent, a request made by another site fails the Origin check, and a request that does not know the per-session CSRF value fails the header check.
- **Hook token**: a separate token that can only post events. A leaked hook token cannot open the office or stop the server.

## Identity challenge

A random program could start listening on port 3200 before the Office and wait for something to send it a token. To prevent that, `GET /api/health/proof?n=<nonce>` returns an HMAC of the caller's nonce keyed by the token. Only a process that knows the token can answer correctly. The CLI and the hook script check this proof **before** sending any credential, and the hook also confirms that `runtime.json` names a live process. The proof reveals nothing usable: the nonce is chosen by the caller and the key has 256 random bits.

## Other rules

- The browser sends only message text, validated names, ids, decisions and closed-list settings. Never a path, a command, an argument or an environment variable. Child processes are started without a shell and with arguments built by the server.
- Project folders will be limited to first-level subfolders of the projects root, resolved to their real path (links, UNC paths, 8.3 names and reserved names are rejected) when the chat arrives in Phase 2.
- Approvals will never default to "yes": any error leaves the decision to Claude's normal flow.
- The `settings.json` installer shows a diff, makes a backup, merges additively, and on the real file needs you to type `APLICAR` in an interactive terminal.
- The office never reads Claude's OAuth credentials.

## Rotate and revoke

Use **Settings → Sign out** for this browser, or [rotate the token](../how-to/rotate-token.md) to invalidate everything at once. See also [Log out](../how-to/log-out.md).

## Related

- [Routes reference](../reference/api.md)
- [Privacy and zero token cost](privacy-and-cost.md)
