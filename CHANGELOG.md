# Changelog

All notable changes to this project are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Portuguese version: [CHANGELOG.pt-BR.md](CHANGELOG.pt-BR.md).

## [Unreleased]

## [0.1.0] - 2026-11-14

First phase of the local office: the panel that shows the Claude Code agent team as a pixel-art
office on `127.0.0.1`, with the team roster, live NPC states, activity, and diagnostics.

### Added

- Canvas 2D office engine: the world is drawn at 1x and scaled once per frame, with a 30 fps cap,
  quality degradation, and hidden-tab pause.
- Map and collision layers, A* pathfinding, camera math, and a Brasilia studio clock with a
  day and night tint.
- NPC behaviour (finite-state machine v1), seat allocation, and sprite keys for each agent.
- Top bar, keyboard shortcuts, a credits screen, NPC card, panel, team drawer, minimap, and a
  desktop hint for installs without hooks.
- Diagnostic notices with stable codes translated in the interface, and a developer overlay
  enabled with `?debug`.
- Bundled OFL pixel fonts (Pixelify Sans and Silkscreen) with their licence texts and credits.
- Bilingual documentation: root README, documentation index, first-use tutorial, how-to guides,
  reference pages, explanation pages, and the ADR index.
- Hook ingest, JSONL transcript fallback, team registry with validation, and the
  `team:check` and `team:init` commands.
- `escritorio` command for the server lifecycle (`start`, `open`, `stop`, `status`,
  `token:rotate`) and settings commands with diff, apply, and revert.
- Quality gates: `credits:check`, `qa:contrast`, and `perf:fase1`, plus Playwright and integration
  suites for the phase 1 acceptance criteria.

### Changed

- Diagnostics carry a stable `code` and short `params` instead of free text only.
- The dedupe key for hook and transcript events no longer includes the source timestamp.
- The default development root is derived from the OneDrive variables and the user's folder,
  not a fixed personal path.
- Browser sessions use an 8 h idle window under a 24 h absolute cap.

### Fixed

- An NPC that expired, was promoted, or left the team is removed from the browser instead of
  staying on screen.
- Duplicate events from the hook and the transcript fallback are counted once.
- A failed team reload keeps the last valid roster.
- Stopping the transcript watcher waits for in-flight work, and silent subagents receive a
  synthetic stop after two minutes.
- The server shuts down cleanly on signals, and unhandled errors are logged without stack
  traces.
- `stop` only terminates the process that owns the port.
- Settings writes on the real user file require the confirmation word typed in an interactive
  terminal.

### Security

- Clients verify the server's identity (HMAC challenge) before sending the master token or a hook
  token.
- Rate limits are decided on the normalized path, with a per-session bucket and an anonymous
  per-address bucket.
- Logout closes the session's sockets and forgets the session.
- Secret-looking values are masked in the context lines of the settings diff.

[Unreleased]: https://github.com/CarlosSilva-Systems/Escrit-rio-de-Agentes/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/CarlosSilva-Systems/Escrit-rio-de-Agentes/releases/tag/v0.1.0
