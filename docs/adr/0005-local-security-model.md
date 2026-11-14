# ADR-0005: Local security model — loopback only, file token → single-use ticket → HttpOnly session cookie, Host/Origin/CSRF checks, DEV-root jail

> **Resumo (pt-BR):** Servidor só em `127.0.0.1:3200`. O token longo (256 bits) fica em `~/.escritorio-equipe/token` com ACL só do usuário e **nunca vai ao navegador**: o lançador troca o token por um **ticket de uso único (60 s)**, abre `/auth/callback?ticket=…`, o servidor cria cookie de sessão `HttpOnly; SameSite=Strict` e redireciona para `/` sem nada na URL. Toda rota exige sessão; ações exigem `Origin` correto + cabeçalho CSRF; WebSocket checa `Origin`/`Host`/cookie. Hooks usam outro token. Projetos são identificados por **nome de pasta validado**, resolvidos por caminho real canônico dentro de "7 - DEV". Nenhum comando vem do navegador. Terminal somente leitura por padrão. O escritório nunca lê o token OAuth do Claude.

- Status: Proposed
- Date: 2026-11-12
- Deciders: Artur; reviewers: Sérgio (revisor-seguranca), Pedro (pentester); approval: Carlos

## Context
Threats T1–T12 (REQUISITOS §5.2). The panel can inject text into Claude sessions = code execution on Carlos's PC (R-07). Pixel Agents accepts the token in the URL and has CORS `origin:true` (R5). Browsers: Chrome/Edge (Must), Firefox (Should). The 3100 instance shares the host `127.0.0.1` (cookies are **not** port-isolated).

## Decision

### Network
- Bind **only** `127.0.0.1` (hard-coded; `--host` option does not exist). Port 3200 (config `ESCRITORIO_PORT`); if busy → exit with clear message, never fall back (CA-01, CA-02).
- **Host allowlist:** `127.0.0.1:<port>` and `localhost:<port>`; anything else → 421/403 before routing (DNS rebinding).
- No CORS headers at all (same-origin only). Security headers on every response: `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self' ws://127.0.0.1:<port> ws://localhost:<port>; font-src 'self'; media-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'` (if React inline styles require it, only `style-src-attr 'unsafe-inline'` is allowed), `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-origin`, `Cache-Control: no-store` on API.

### Secrets and authentication
- `~/.escritorio-equipe/token` (browser-auth master, 32 random bytes, base64url) and `~/.escritorio-equipe/hook-token` (hooks only). Created on first start; ACL tightened with `icacls <file> /inheritance:r /grant:r "%USERNAME%:F"` (best effort, warning if it fails). Never in argv, env of children, logs, URLs or the repo.
- **Launch flow:** `escritorio open` (Node CLI used by the `.bat`) reads the token, calls `POST /api/auth/ticket` with `Authorization: Bearer` (no `Origin` allowed on this route), receives a **single-use ticket** (128 bits, 60 s), opens `http://127.0.0.1:3200/auth/callback?ticket=<t>`. The server consumes the ticket, sets `esc_sid` (random session id, `HttpOnly; SameSite=Strict; Path=/`, 7-day sliding expiry, in-memory + persisted hash) and redirects 303 to `/`. The ticket in browser history is already dead. Unauthenticated requests get 401 with a static page "abra pelo atalho" (no data) (CA-03).
- Comparisons with `crypto.timingSafeEqual` on equal-length digests. Rate limit on `/auth/*` and `/api/auth/*` (10/min).
- **Rotation:** `npm run token:rotate` regenerates both tokens and invalidates all sessions (hook-token rotation rewrites only our own files).
- Cookie name is unique (`esc_sid`) because the 3100 instance on the same host will receive it; accepted (local trusted app), documented.

### CSRF and WebSocket
- Every state-changing route (POST/PATCH/DELETE) requires: valid session cookie, `Origin` exactly `http://127.0.0.1:<port>` or `http://localhost:<port>`, and header `X-Escritorio-CSRF` equal to the per-session CSRF token returned by `GET /api/session` (CA-30).
- WebSocket upgrade (`/ws`, `/ws/terminal/:id`): Host allowlist + exact `Origin` + valid cookie; otherwise 403 before upgrade. Messages from the browser over `/ws` are ignored except `ping`; terminal channel accepts input only when enabled (below).
- Hook route: hook token, **no `Origin` allowed**, Host check, body ≤ 1 MB.

### Command execution
- The browser can only send: chat text (≤ 32 kB) to a session id it owns, project **names** (validated), session ids (UUID, validated against transcripts of that project), approval decisions, and settings from a **closed list** (CA-31).
- `claude` argv is built only on the server; spawn without shell (`node-pty` file spawn / `child_process.spawn` with `shell:false`). The executable path is resolved once at startup (config `CLAUDE_BIN` or PATH lookup restricted to `.exe`) and must be absolute.
- Git info (phase 3) uses `execFile('git', [fixed args], {cwd: jailedPath, shell:false})`, read-only commands only.

### DEV-root jail (CA-28, CA-29, CA-44)
- `devRoot` from config (default `C:\Users\carlo\OneDrive\Documentos\7 - DEV`), canonicalized at startup with `fs.realpathSync.native`.
- Browser sends a **project name**, never a path. Name rules: 1–100 chars, `^[\p{L}\p{N} ._()-]+$`u, no leading/trailing dot or space, not `.`/`..`, not Windows reserved names (CON, PRN, AUX, NUL, COM1–9, LPT1–9, with or without extension), no `~` followed by digit (8.3 alias).
- Resolution: `candidate = path.join(devRoot, name)`; `lstat` → reject if symbolic link/junction (`isSymbolicLink()`); `real = realpath.native(candidate)`; require `path.relative(devRoot, real)` to be a single segment, not absolute, not starting with `..`, compared case-insensitively. Reject UNC (`\\`), device (`\\?\`, `\\.\`) and ADS (`:` after the drive). Re-validated at every use (TOCTOU-tolerant: validate immediately before spawn/read).
- Project creation: `mkdir` (non-recursive) of the validated name, then re-validate.
- OneDrive placeholders (cloud files) are reparse points but not symlinks; realpath check still applies (test in T-40 with a real OneDrive folder).

### Terminal tab
- Read-only by default. "Permitir entrada" is a per-session toggle (POST with CSRF), auto-disabled after 15 min idle or session restart; input frames limited to 4 kB, rate-limited.

### Privacy (§5.3)
- Never persist prompts, replies, tool inputs/outputs or file contents; only aggregates and ids. Chat shows transcript content transiently from the JSONL owned by Claude Code. Approval details shown with secret masking (patterns: `sk-…`, `ghp_…`, `AKIA…`, JWT-like, `password=`, `.env` lines, `Authorization:`).
- Logs: pino with redaction of `authorization`, `cookie`, `x-escritorio-csrf`, query `ticket`, and **no request/response bodies**; paths outside devRoot logged as basename only.
- Never read `~/.claude/.credentials.json` or any OAuth token; the server has a deny-list check in its file readers.

## Alternatives considered
- **Token in URL query, kept by the page (Pixel Agents style).** Leaks to history, screenshots, process lists. Rejected.
- **Token in URL fragment exchanged by JS.** Requires serving the app unauthenticated; still persists the long-lived token in history unless replaced. Rejected in favor of the single-use ticket.
- **Basic auth / no auth on loopback.** Any local page/process could drive Claude. Rejected.

## Consequences
- (+) Long-lived secret never reaches the browser; every action needs cookie + Origin + CSRF; WebSocket hijacking and DNS rebinding blocked.
- (−) Opening the panel requires the launcher (`.bat`/`npm run open`) or `escritorio open`; a plain bookmark shows "abra pelo atalho" once the session expires (7 days sliding).
- Pentest scope (CA-46) derives directly from this ADR.
