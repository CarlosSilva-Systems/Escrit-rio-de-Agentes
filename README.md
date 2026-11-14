# Escritório da Equipe (Team Office)

A local pixel-art web panel where a team of Claude Code agents "lives": every agent is an NPC at a desk that starts working when Claude Code calls that agent. It is built for a single user on Windows 11.

[🇧🇷 Português](README.pt-BR.md)

> **Local only.** The server listens on `127.0.0.1:3200` and nowhere else. There is no option to expose it to the network, and none will be added.

## Features

Current state: **Phase 1 of 5 (Foundation)**. Version `0.1.0`.

What already works:

- A pixel-art office floor (64×52 tiles) with all the fixed rooms and four vacant project rooms.
- One NPC per agent in `QUADRO.md` (16 today), with name, title, department and a live status: idle, working or waiting for approval.
- Agents called by Claude Code start working in about 140 ms (hooks) or 1–2 s (reading the session files). Unknown agent types appear as temporary "visitor" Freelancers.
- Hover card, click panel with recent activity, team drawer, minimap, zoom, pan and "follow this NPC".
- Portuguese (default) and English interface, switchable without reloading; keyboard shortcuts; respects `prefers-reduced-motion`.
- Secure access (one-time ticket, session cookie, CSRF), with Settings → Sign out and the `escritorio` command line (`open`, `start`, `stop`, `status`, `token:rotate`, `settings:*`, `hooks:sync`, `team:*`).
- A reviewable, reversible installer for the Claude Code hooks (`settings:diff` / `settings:apply` / `settings:revert`). **Nothing has been applied to your `settings.json`.**

What does **not** work yet (the C, T, A and M panels open a "coming in the next stages" placeholder):

| Phase | Missing |
|---|---|
| 2 – Command | Chat with the Director, "Needs you" approvals inbox, project list |
| 3 – Tracking | Task kanban from `PLANO.md`, usage meter (5 h / 7 d), token counts (the NPC panel shows "—") |
| 4 – Life | NPC conversations, mascots, day/night, weather, sounds, TV and phone layouts |
| 5 – Switch | Replacing the installed Pixel Agents, start with Windows |

The artwork is provisional (drawn in code). See [Known limitations](docs/en/explanation/limitations.md).

## Quick start

Requirements: Windows 11, Node.js 26 (`>=26 <27`), npm, Git and a Chromium browser (Edge or Chrome).

1. Install Node.js 26 LTS from [nodejs.org](https://nodejs.org/) and check it with `node --version`.
2. Clone the repository and enter the folder: `git clone <repository-url> escritorio-equipe` then `cd escritorio-equipe`.
3. Install the dependencies exactly as locked: `npm ci`.
4. Build the web app, the server and the CLI: `npm run build`.
5. Open the office: `npm run open` (or double-click `scripts\abrir-escritorio-dev.bat`).

`open` starts the server in the background if needed and opens your browser already signed in. Stop it with `node dist/cli.js stop`. Step-by-step tour: [First use](docs/en/tutorials/first-use.md).

## Configuration

All variables are optional and none is a secret (tokens live in files, never here). Set them in your shell only if you want to change a default (for example `$env:ESCRITORIO_PORT=3300` in PowerShell). `.env.example` documents them, but the server does not read a `.env` file. The full table is in the [environment reference](docs/en/reference/environment.md).

| Name | Required | Default | Description |
|---|---|---|---|
| `ESCRITORIO_PORT` | no | `3200` | Loopback port. If busy, the server exits with an error. |
| `ESCRITORIO_HOME` | no | `%USERPROFILE%\.escritorio-equipe` | Runtime data (tokens, state, logs). |
| `ESCRITORIO_DEV_ROOT` | no | derived from OneDrive/Documents | Folder whose subfolders are projects (`7 - DEV`). |
| `ESCRITORIO_LOG_LEVEL` | no | `info` | `trace`, `debug`, `info`, `warn` or `error`. |
| `CLAUDE_BIN` | no | from `PATH` | Absolute path to `claude.exe` (used from Phase 2). |

## Usage

```
npm run open                       # start if needed and open the browser, signed in
node dist/cli.js status            # is it running?
node dist/cli.js stop              # stop the server
npm run team:check                 # QUADRO.md x escritorio.json x map
npm run settings:diff              # show the proposed hook changes (writes nothing)
```

Every command, option and exit code: [CLI reference](docs/en/reference/cli.md).

## Security in five lines

1. Binds `127.0.0.1` only; the port never changes by itself.
2. The long-lived token stays in a file with user-only permissions and never reaches the browser, a URL or a log.
3. The browser gets a 60-second single-use ticket, trades it for an `HttpOnly`, `SameSite=Strict` session cookie, and actions also need `Origin` and CSRF checks.
4. The browser never sends paths, commands or environment variables; the server builds everything itself.
5. Prompts, answers and tool inputs are never stored or logged, and the office spends zero tokens. See [Local security](docs/en/explanation/security.md).

## Development

```
npm run dev          # web build in watch mode + server in watch mode on port 3200
npm run check        # lint + typecheck + credits check + unit + integration tests (required before delivering)
npm run test:e2e     # Playwright (installed Edge)
npm run schemas:gen  # regenerate schemas/*.json from the zod contracts
```

## Contributing

- Code, identifiers and comments in English; interface text only through i18n (`src/web/i18n/pt-BR.json` is the source, `en.json` must have the same keys).
- Documentation is bilingual (`docs/en` and `docs/pt-BR`, `README` and `README.pt-BR`): change both in the same commit.
- Commits follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat(server): …`, `fix(web): …`, `docs: …`), small and atomic, on a branch per phase (`feat/fase-N-<name>`).
- Every commit is authored by the repository owner account; no co-author trailers.
- Add a third-party asset only with an entry in `CREDITS.md` / `CREDITS.pt-BR.md` (`npm run credits:check`).
- New dependencies need a justification in the pull request, pinned to an exact version.

## Documentation

Start at the [documentation index](docs/en/README.md): tutorial, how-to guides, reference, explanations and the [ADR index](docs/en/adr/README.md).

## License

[MIT](LICENSE). The concept and part of the technical approach come from [Pixel Agents](https://github.com/pablodelucca/pixel-agents) by Pablo De Lucca (MIT); its license text is kept in `third_party/pixel-agents/LICENSE`. No Pixel Agents art, font or sound is used. See [NOTICE.md](NOTICE.md) and [CREDITS.md](CREDITS.md).
