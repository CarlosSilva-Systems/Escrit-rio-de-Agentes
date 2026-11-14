# Reference: environment variables

[🇧🇷 Português](../../pt-BR/reference/environment.md) · [Documentation index](../README.md)

None of these is a secret: tokens live in files (see [Files](files.md)). Set them in the shell that runs the command (PowerShell: `$env:NAME = "value"`). The server and the CLI do **not** read a `.env` file; `.env.example` only documents the names. Empty values count as "not set". An invalid value stops the program with `Invalid environment configuration: <reason>` (exit code 1).

There is deliberately **no variable for the network address**: the server always binds `127.0.0.1`.

| Name | Required | Default | Read by | Description |
|---|---|---|---|---|
| `ESCRITORIO_PORT` | no | `3200` | server, CLI | Loopback port, integer 1–65535. If busy, the server exits with code 3; it never picks another port. |
| `ESCRITORIO_HOME` | no | `%USERPROFILE%\.escritorio-equipe` | server, CLI, hook | Directory for tokens, state, cache, logs and the hook scripts. |
| `ESCRITORIO_DEV_ROOT` | no | first existing of `%OneDrive%\Documentos\7 - DEV`, `%OneDrive%\Documents\7 - DEV`, `%USERPROFILE%\Documents\7 - DEV`, `%USERPROFILE%\Documentos\7 - DEV`; otherwise `%USERPROFILE%\Documents\7 - DEV` | server | Root folder whose first-level subfolders are the projects. A session's working folder inside it names the project in the office. |
| `ESCRITORIO_LOG_LEVEL` | no | `info` | server | `trace`, `debug`, `info`, `warn` or `error`. |
| `CLAUDE_BIN` | no | resolved from `PATH` (`.exe` only) | server | Absolute path to `claude.exe`. Reserved for the chat (Phase 2); Phase 1 never runs `claude`. |
| `ESCRITORIO_CLAUDE_HOME` | no | `%USERPROFILE%\.claude` | server | Where Claude Code data lives. The server reads `projects\` (Level 0 session files) and `equipe\` (`QUADRO.md`, `escritorio.json`) from here. Mainly for tests and non-standard installs. |
| `ESCRITORIO_NO_BROWSER` | no | unset | CLI (`open`) | `1` makes `open` print the one-time URL instead of launching the browser. |
| `ESCRITORIO_HOOK_DEBUG` | no | unset | hook script | `1` makes the hook append timing metadata (event name, session id, milliseconds, status; never content) to `logs\hook.log`. |

`escritorio.json` and `QUADRO.md` normally sit in `%USERPROFILE%\.claude\equipe\`; the `team:*` commands always use that folder regardless of `ESCRITORIO_CLAUDE_HOME` unless you pass `--quadro` / `--escritorio`.

## Related

- [Files reference](files.md)
- [CLI reference](cli.md)
