# Reference: command line

[🇧🇷 Português](../../pt-BR/reference/cli.md) · [Documentation index](../README.md)

The `escritorio` command is the compiled file `dist/cli.js` (run `npm run build` first). Run it as `node dist/cli.js <command>` from the project folder. Some commands also have an npm script.

Messages are printed in the language saved as `lang` in `config.json` (`pt-BR` by default). Running with no command prints the usage and exits with 0; an unknown command exits with 1.

## Server lifecycle

| Command | npm script | What it does |
|---|---|---|
| `start` | — | Starts the server in the background (hidden window, output to `logs\server-stdout.log`) if it is not running. Idempotent: if a healthy server answers on the port, it starts nothing. Waits up to 20 s for it to become healthy. |
| `open [--no-browser]` | `npm run open` | Starts if needed, asks the server for a single-use 60 s ticket, and opens `http://127.0.0.1:<port>/auth/callback?ticket=…` in the default browser. With `--no-browser` (or `ESCRITORIO_NO_BROWSER=1`) it prints that one-time URL instead of opening it. |
| `stop` | — | Asks the server to shut down gracefully (waits up to 10 s). If it does not answer, kills the PID in `runtime.json` only when that PID owns the port. Prints "not running" and exits 0 if nothing is running. |
| `status` | — | Prints `Running: http://127.0.0.1:<port> · PID <pid> · version <version>` and exits 0, or "not running" and exits 1. |
| `token:rotate` | — | New master and hook tokens; deletes saved browser sessions. See [Rotate the access token](../how-to/rotate-token.md). |

The server alone, in the foreground: `npm start` (`node dist/server/index.js`).

## Team

| Command | npm script | Options |
|---|---|---|
| `team:check` | `npm run team:check` | `--quadro <file>` (default `%USERPROFILE%\.claude\equipe\QUADRO.md`), `--escritorio <file>` (default `%USERPROFILE%\.claude\equipe\escritorio.json`), `--mapa <file>` (default `assets\map\mapa.json`, relative to the current folder), `--lang pt-BR\|en` |
| `team:init` | `npm run team:init` | `--confirm-approved` (required), `--proposal <file>` (default `docs\projeto\2026-11-12-escritorio-equipe\escritorio.proposta.json`), `--dest <file>` (default `%USERPROFILE%\.claude\equipe\escritorio.json`), `--overwrite` (saves `<dest>.bak-<date>` first), `--lang pt-BR\|en` |

`team:check` compares `QUADRO.md`, `escritorio.json` and the map: every agent has an NPC and vice versa, one lead, unique agents and desks, desks exist in the map and belong to a room of the agent's department. Without a map file, desk and room checks are skipped (with a notice); with an explicit `--mapa` that is missing, it fails.

`team:init` writes the proposal as `escritorio.json` only after confirmation and validation, atomically.

## Claude Code settings

| Command | npm script | Options |
|---|---|---|
| `settings:diff` | `npm run settings:diff` | `--level 1\|2` (default 1), `--settings-file <file>` (default `%USERPROFILE%\.claude\settings.json`). Writes nothing. |
| `settings:apply` | `npm run settings:apply` | `--level 1\|2` (required), `--confirm APLICAR` (only for files other than the real one), `--settings-file <file>`, `--i-am-carlo-and-approved` (required for the real file) |
| `settings:revert` | `npm run settings:revert` | `--settings-file <file>`, `--i-am-carlo-and-approved` (required for the real file) |
| `hooks:sync` | `npm run hooks:sync` | `--settings-file <file>` |

- **Level 1**: adds the Office hook (`escritorio-hook.cjs`) to 13 events, next to existing ones (11 existing events plus `UserPromptSubmit` and `TaskCreated`). **Level 2** (Phase 3): wraps the status line; its script does not exist yet.
- On the real `settings.json`, `apply` and `revert` require an interactive terminal where you type `APLICAR`; `--confirm` is ignored there. The script directory must contain `.escritorio-equipe` in its path (that is how `revert` recognises what is ours).
- `hooks:sync` copies `src/hook-runtime/*` to `%USERPROFILE%\.escritorio-equipe\bin` and writes the panel's `claude-settings.json`. It never touches `settings.json`.

Procedure: [See Claude Desktop sessions](../how-to/see-desktop-sessions.md).

## Exit codes

| Command | Code | Meaning |
|---|---|---|
| any | `0` | Success |
| any | `1` | Failure: unknown command, invalid environment, command error, `status` with no server |
| `settings:*`, `hooks:sync` | `2` | Usage error (unknown option or missing value, bad or missing `--level`) |
| `team:check` | `1` | Inconsistencies found (errors or warnings) |
| `team:check` | `2` | A required file is missing or unreadable, or usage error |
| `team:init` | `1` | Invalid proposal, or destination exists without `--overwrite` |
| `team:init` | `2` | Missing `--confirm-approved`, proposal not found, or usage error |
| server (`npm start`) | `3` | Port already in use |
| server (`npm start`) | `4` | Could not open the port for another reason |

## Related

- [Environment variables](environment.md)
- [Troubleshooting](../how-to/troubleshooting.md)
