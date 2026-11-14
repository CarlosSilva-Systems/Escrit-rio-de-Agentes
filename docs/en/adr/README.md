# Architecture Decision Records (index)

[🇧🇷 Português](../../pt-BR/adr/README.md) · [Documentation index](../README.md)

Each ADR records one decision: context, decision, alternatives and consequences. ADRs are written in English with a Portuguese summary at the top and live in [`docs/adr/`](../../adr/). Once accepted they are not edited; a changed decision becomes a new ADR that supersedes the old one.

The status column shows what the file itself says. The plan was approved on 2026-11-13, but the ADR files still read "Proposed".

| ADR | Title | Status | In one line |
|---|---|---|---|
| [0001](../../adr/0001-codebase-selective-reuse-of-pixel-agents.md) | Codebase: new repository with selective, attributed reuse of Pixel Agents (MIT) | Proposed | A new repository that copies only small, attributed MIT portions of Pixel Agents and reuses none of its art. |
| [0002](../../adr/0002-rendering-canvas-2d.md) | Rendering: custom Canvas 2D engine (PixiJS as measured fallback, Phaser rejected) | Proposed (final after spike S-02) | Draw at native size and scale by whole numbers; move to PixiJS only if measurements demand it. |
| [0003](../../adr/0003-chat-session-mode.md) | Chat session mode: interactive PTY session by default, `claude -p` as opt-in | Proposed (final after spike S-01 and your billing confirmation) | The chat drives a real interactive Claude Code session and reads its transcript; the automatic mode is opt-in with a cost warning. |
| [0004](../../adr/0004-event-transport-and-approvals.md) | Event transport and approvals: own command hook to the local server, layered opt-in | Proposed (settings changes need your OK) | A dependency-free hook posts events; Level 0 reads files, Level 1 adds hooks to `settings.json`, Level 2 wraps the status line. |
| [0005](../../adr/0005-local-security-model.md) | Local security model: loopback only, file token, single-use ticket, session cookie, Host/Origin/CSRF, projects jail | Proposed | Local-only server, secret in a file, ticket in the URL, cookie in the browser, no commands from the browser. |
| [0006](../../adr/0006-data-sources-readers-and-persistence.md) | Data sources, tolerant readers and persistence | Proposed | State lives in memory; only minimal aggregates are written under `~/.escritorio-equipe`, atomically. |
| [0007](../../adr/0007-stack-and-repository-layout.md) | Stack and repository layout | Proposed | One npm package, Node 26, Fastify 5, React 19 with Vite 8, TypeScript 6, exact versions. |
| [0008](../../adr/0008-team-and-map-config-contracts.md) | Versioned config contracts: `escritorio/v1` and `mapa/v1` | Proposed | Two versioned JSON files describe the team and the floor; desks link them by id; invalid means warning plus last valid. |

## Related

- [Architecture](../explanation/architecture.md)
- [Contracts reference](../reference/contracts.md)
