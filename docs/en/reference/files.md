# Reference: files

[🇧🇷 Português](../../pt-BR/reference/files.md) · [Documentation index](../README.md)

## `%USERPROFILE%\.escritorio-equipe\` (runtime data)

Created on first start; override with `ESCRITORIO_HOME`. It lives outside OneDrive on purpose. Files with secrets are restricted to your user, SYSTEM and Administrators with `icacls`; if that fails the server logs a warning naming the file.

| Path | Content | Secret |
|---|---|---|
| `token` | Master token, 256 bits (43 base64url characters). Used by the CLI to ask the server for tickets and to stop it. Never sent to the browser. | yes |
| `hook-token` | Hook token, 256 bits. Used only by the hook script towards `/api/hooks/v1/claude`. | yes |
| `config.json` | Public settings (closed list): `lang` (`pt-BR`/`en`), `sound`, `music`, `quality` (`auto`/`high`/`medium`/`low`), `approvalDeadlineSec` (10–300, default 60), `chatMode` (per project), `npcWorkPlace` (`desk`/`projectRoom`/`auto`). Written by `PATCH /api/config` (language and sound switches in the interface). An invalid field falls back to its default and a warning is logged; the file is not rewritten. `lang` also sets the language of CLI and server messages. | no |
| `runtime.json` | `{pid, port, startedAt, version}` of the running server. Removed on clean shutdown. | no |
| `sessions.json` | Browser sessions as SHA-256 hashes with creation and last-use times (never the cookie itself). Bound to the token generation. | no |
| `bin\` | Hook scripts copied by `hooks:sync` (`escritorio-hook.cjs`). | no |
| `claude-settings.json` | Settings handed to panel-opened Claude sessions with `--settings` (Phase 2). Written by `hooks:sync`. | no |
| `logs\` | `escritorio-<date>.log` (kept 7 days), `server-stdout.log` (start-up output), `hook.log` (only with `ESCRITORIO_HOOK_DEBUG=1`). Tokens, cookies and tickets are redacted; prompts and tool data are never logged. | no |
| `cache\` | Reserved for derived data; empty in Phase 1. | no |

All writes are atomic (temporary file, then rename, with retries on Windows).

## `%USERPROFILE%\.claude\` (Claude Code's data, read by the office)

| Path | Who writes it | How the office uses it |
|---|---|---|
| `equipe\QUADRO.md` | The `rh-equipe` skill | Table "Equipe ativa": the list of agents. Read-only. |
| `equipe\escritorio.json` | You (or `team:init`) | Who is who: names, titles, desks, phrases. Watched; see [Contracts](contracts.md). Does not exist yet. |
| `equipe\uso.json` | The status-line script (Phase 3) | Usage meter. Not used in Phase 1. |
| `projects\**\*.jsonl` | Claude Code | Level 0: new `subagents\agent-<id>.jsonl` files and recent lines (ids, tool names, working folder only). Read-only; history is never replayed. |
| `settings.json` | You; `settings:apply` only with your approval | Level 1 hooks. A backup `settings.json.bak-<date>-<time>` is created before any change. |

The office never reads `.credentials.json` or any OAuth token.

## In the repository

| Path | Content |
|---|---|
| `assets\map\mapa.json` | The office floor (`mapa/v1`): rooms, doors, desks, seats, points of interest. |
| `assets\fonts\` | Pixelify Sans and Silkscreen (SIL OFL 1.1) with their license texts. |
| `schemas\*.json` | JSON Schemas generated from the zod contracts (`npm run schemas:gen`): `escritorio.v1`, `mapa.v1`, `uso.v1`, `events.v1`, `rest.v1`. |
| `src\hook-runtime\escritorio-hook.cjs` | Source of the hook (plain Node, no dependencies, no build). |
| `scripts\abrir-escritorio-dev.bat` | Development launcher: builds if `dist` is missing, then runs `open`. |
| `dist\` | Build output: `web\`, `server\index.js`, `cli.js`. Not versioned. |
| `docs\projeto\2026-11-12-escritorio-equipe\` | Internal project plan, requirements, QA reports (Portuguese). |
| `CREDITS.md`, `NOTICE.md` (and `.pt-BR`) | Third-party credits and Pixel Agents attribution. |

## Related

- [Environment variables](environment.md)
- [Local security model](../explanation/security.md)
