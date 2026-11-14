# Known limitations of Phase 1

[🇧🇷 Português](../../pt-BR/explanation/limitations.md) · [Documentation index](../README.md)

An honest list of what is missing, provisional or imperfect in version `0.1.0`. Items marked "gate" wait for a decision or action from you (see `docs/projeto/2026-11-12-escritorio-equipe/PLANO.md`).

## Not built yet

- **Phases 2 to 5.** The chat with the Director, the approvals inbox, project creation, the task kanban, the usage meter, token counts, NPC conversations, mascots, day/night and sounds, and replacing the installed Pixel Agents do not exist. The C, T, A and M panels show a placeholder. The NPC panel shows "—" for tokens.
- **Settings Level 2** (status-line wrapper): its script does not exist; do not apply `--level 2`.

## Waiting for you (gates)

- **G1, the name list.** `escritorio.json` has not been created, so the office runs on a reserve team derived from `QUADRO.md` (everyone on provisional desks) and shows a notice. The `rh-equipe` skill does not update the file yet.
- **G4, the diff of `settings.json`.** Nothing has been applied. Without Level 1 the office relies on reading session files (1–2 s delay).
- **G2, Claude Code CLI.** It is not installed on the development machine, so the hook payload formats were built from the documentation and synthetic fixtures. They have not been checked against a real Claude Code run, and a real Claude Desktop session has not been observed end to end. Treat the hook field names as provisional until that check.
- **ADR status.** All eight ADRs still say "Proposed" although the plan was approved on 2026-11-13; ADR-0002 and ADR-0003 are explicitly pending their spikes and your confirmation.

## Performance

- **Worst-case CPU is about 15.7 % of one core** (20 NPCs walking, rain and night) against a 10 % target. Idle and ordinary use meet their targets (2.8 % idle, 3.5 % with five working). Optimizations are identified; see [Why Canvas 2D](why-canvas-2d.md) and [Performance](../reference/performance.md).
- Not measured: a 10-minute CPU run, a visible Edge window, a server running 8 hours.

## Appearance

- **The art is provisional**, drawn in code, with no third-party images. The final art pack was not chosen or bought (gate G3), and paid packs without redistribution rights would live in `assets-private/`, outside Git.
- The server tracks at most 12 Freelancers (visitors) at a time and drops the events of the rest with a notice. The map has seats for about 15 visitors.

## Interface

- **No "Log out" button.** The server has the route; use [token rotation](../how-to/rotate-token.md) or clear the cookie ([Log out](../how-to/log-out.md)).
- **Language and sound choices are kept in the browser only.** The browser calls `PATCH /api/config`, which the server does not implement yet, and ignores the failure. The language of the command line comes from `config.json`, which you edit by hand.
- **Escape closes one layer at a time** (up to four presses to clear everything), by design.

## Platform

Windows 11 only, one user, `127.0.0.1` only.

## Related

- [Requirements coverage](../reference/requirements-coverage.md)
- [Architecture](architecture.md)
