# Troubleshooting

[🇧🇷 Português](../../pt-BR/how-to/troubleshooting.md) · [Documentation index](../README.md)

Each entry is a symptom followed by what to do. Messages from the command line come in the language saved in `config.json` (Portuguese by default); both versions are shown where useful.

Logs are in `%USERPROFILE%\.escritorio-equipe\logs\` (`server-stdout.log` for start-up, `escritorio-<date>.log` for the server). They never contain prompts, answers or tokens.

## Port 3200 is busy

**Symptom:** the server exits with code `3` and prints "Port 3200 is already in use by the process node.exe (PID …). The Office never switches ports on its own…".

1. Run `node dist/cli.js status`. If it says "Running", the Office is already up: just use `npm run open`.
2. If something else owns the port, find it: `netstat -ano | findstr :3200`, then stop that process, or
3. Choose another port: set `ESCRITORIO_PORT` (for example `$env:ESCRITORIO_PORT=3300` in PowerShell) before every command. The Office never picks a port by itself.

(The installed Pixel Agents uses port 3100, so it does not conflict.)

## The page says "Open the office from the shortcut" (401)

You opened the address without the one-time ticket, the ticket was used up or older than 60 seconds, the session expired, or the token was rotated. Close the tab and run `npm run open` (or the `.bat` shortcut). Pressing "Try again" on that page only retries the same request.

## The session ended by itself

A browser session ends after 8 hours without use, or 24 hours after it started. Reopen from the shortcut. See [Log out](log-out.md).

## "Too many requests"

You hit the rate limit (120 requests per minute for the API). Wait a moment. If it keeps happening, something is polling the server in a loop.

## `open` or `start` complains

- `Compiled server not found (…). Run "npm run build".` → run `npm run build`.
- `The Office did not become healthy within 20 s. See the log at …` or `The server exited while starting (code …)` → read the end of `server-stdout.log`. Common causes are a busy port or an invalid environment variable.
- `Invalid environment configuration: …` → fix the named variable (for example `ESCRITORIO_PORT` must be a number from 1 to 65535).
- The browser shows `The web interface has not been built yet. Run "npm run build".` → run `npm run build`.

## `stop` refuses to kill a process

`Did not kill PID …: it does not own the Office port (stale runtime.json?)`. The server did not answer the graceful shutdown and the saved PID is not the one listening on the port, so the command refuses to kill a stranger. Find the real owner with `netstat -ano | findstr :3200` and stop it yourself, or delete `%USERPROFILE%\.escritorio-equipe\runtime.json` if no Office is running.

## A yellow or blue notice at the top of the office

| Notice | Meaning | What to do |
|---|---|---|
| "Using the reserve team from QUADRO.md: escritorio.json has not been created yet." | There is no `escritorio.json`; the team comes from `QUADRO.md`. This is a calm note, not an error. | Normal until you [create the file](customize-npcs.md). Dismiss it if you like. |
| A warning strip such as "Problem in escritorio.json · <field>: invalid value. Keeping the last valid configuration." | The file exists but is invalid. Each problem has its own translated sentence (see [diagnostic codes](../reference/contracts.md#diagnostic-codes)): not valid JSON, too large, invalid value, unexpected format, duplicate agent, desk or department, unknown department, no or several leads, desk or room missing on the map, desk in another department's room. The last valid team stays. | Fix the named field and save; it is reread on its own. Check with `npm run team:check`. |
| "Notice about <file> · <field>. Details in the server log." or "Mismatch between escritorio.json, the team and the map" | A file disagrees with another (for example a desk that is not on the map, or a `QUADRO.md` problem). | Read the server log in the `logs` folder, then fix the named file. Check with `npm run team:check`. |
| "Freelancer limit reached: N event(s) from unknown agents were dropped." | More than 12 unknown agents (Freelancers) were active at once. | Add the types you use to `escritorio.json`; the rest are ignored. |
| "N warnings while loading the map and art." | The map or art had warnings. | Open the page with `?debug` for details; run `npm run team:check` to check the map against the team. |

## "Claude Desktop sessions not detected"

The office saw no event at all and Level 1 is not installed. Possible causes:

1. No Claude activity happened since the server started. Call an agent in Claude Desktop and look again.
2. Level 0 reads `%USERPROFILE%\.claude\projects`. If your Claude data is elsewhere, set `ESCRITORIO_CLAUDE_HOME`.
3. For real-time sessions install Level 1: [See Claude Desktop sessions](see-desktop-sessions.md).

The notice only counts events; it does not mean something is broken.

## An agent works but shows as a visitor (Freelancer)

Its `agent_type` is not in `escritorio.json`. Add it ([Customize the NPCs](customize-npcs.md)) and the visitor is replaced by the real NPC.

## "No connection to the server" / "Server unavailable"

The page lost the server and retries with growing delays (1 s up to 30 s). Check `node dist/cli.js status`, start it with `npm run open` if needed, or press "Try now".

## Related

- [CLI reference](../reference/cli.md)
- [Environment variables](../reference/environment.md)
