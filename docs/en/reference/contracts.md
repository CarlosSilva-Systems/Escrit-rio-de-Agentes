# Reference: data contracts

[🇧🇷 Português](../../pt-BR/reference/contracts.md) · [Documentation index](../README.md)

The contracts are written in zod in `src/shared/contracts/` and exported as JSON Schema into `schemas/` by `npm run schemas:gen`. A test fails when the schemas are out of date. The `schema` field of each file carries the version; compatible additions keep `v1`, an incompatible change becomes `v2` with a migration and a new ADR ([ADR-0008](../../adr/0008-team-and-map-config-contracts.md)).

| Contract | File it describes | JSON Schema | Written by |
|---|---|---|---|
| `escritorio/v1` | `%USERPROFILE%\.claude\equipe\escritorio.json` | [`schemas/escritorio.v1.schema.json`](../../../schemas/escritorio.v1.schema.json) | you, `team:init`, the `rh-equipe` skill (planned) |
| `mapa/v1` | `assets\map\mapa.json` | [`schemas/mapa.v1.schema.json`](../../../schemas/mapa.v1.schema.json) | the project (converted from the floor plan) |
| `uso/v1` | `%USERPROFILE%\.claude\equipe\uso.json` | [`schemas/uso.v1.schema.json`](../../../schemas/uso.v1.schema.json) | the status-line script (Phase 3) |
| events and WebSocket messages | in memory | [`schemas/events.v1.schema.json`](../../../schemas/events.v1.schema.json) | the server |
| REST bodies | in transit | [`schemas/rest.v1.schema.json`](../../../schemas/rest.v1.schema.json) | the server |

Reading rules: files written by others (`escritorio.json`, hook payloads, session files, `uso.json`) are parsed tolerantly: never an exception, unknown fields are ignored, problems become diagnostics. Action routes are the opposite: strict schemas that reject unknown fields.

## `escritorio/v1`

Root object:

| Field | Type | Notes |
|---|---|---|
| `schema` | `"escritorio/v1"` | required |
| `updatedAt` | ISO date-time | optional |
| `studio` | `{name (1–40), nameIsProvisional}` | studio name shown in the top bar |
| `departments` | list, at least 1 | `{id, name (1–40), colorToken (dept-…), rooms[] (map room ids)}` |
| `agents` | list, at least 1 | see below |
| `freelancer` | object | the visitor shown for unknown agent types: `nickname`, `title`, `sprite`, `badge: "visitante"`, `showAgentTypeAsLabel`, `phrases`, `homeRoom` (`REC`) |
| `mascots` | list, up to 4, optional | `{id, name, species: pomeranian\|golden-retriever, description?, sprite}` (used from Phase 4) |

Agent:

| Field | Type | Notes |
|---|---|---|
| `agentType` | slug | Unique. Equals the agent's file name in `~/.claude/agents/` and the hook's `agent_type`. |
| `nickname` | 1–24 characters | |
| `fullName` | 3–60 characters | |
| `title` | 2–60 characters | |
| `department` | slug | Must exist in `departments`. |
| `desk` | map id or `null` | e.g. `ENG-02`. `null` means a provisional desk. |
| `provisional` | boolean | default `false` |
| `sprite` | slug | |
| `badge` | `staff` \| `diretoria` | default `staff` |
| `isLead` | boolean | exactly one agent has `true` (the main-thread agent, `chefe`) |
| `since` | date `YYYY-MM-DD` | optional |
| `personality` | `{traits[1–6], tone (≤160), routineWeights?}` | `routineWeights` keys: `coffee`, `copa-chat`, `water`, `window`, `terrace`, `arcade`, `pingpong`, `bathroom`, `library`, `sofa`; values 0–5 |
| `phrases` | up to 50 strings, each 1–120 characters | |

Rules across the file: unique `agentType`, unique department ids, every department exists, no desk assigned twice, exactly one lead. Rules against other files, checked by `team:check` and at load time: every agent of `QUADRO.md` has an entry and vice versa, the desk exists in the map and belongs to a room of the agent's department. Fields are strict: unknown fields make the file invalid. Maximum size 1 MiB.

On error the server keeps the last valid configuration and publishes a diagnostic naming the file and the field. With no valid file at all it builds a reserve team from `QUADRO.md` (everyone on a provisional desk).

The proposed file for the 16 agents is `docs/projeto/2026-11-12-escritorio-equipe/escritorio.proposta.json`.

## `mapa/v1`

Top-level keys: `schema`, `tileSize` (16), `cols` (64), `rows` (52), `tilesets`, `layers`, `collision`, `rooms`, `doors`, `desks`, `seats`, `pois`, `objects`, `lightZones`, `lights`, `windows`, `boards`, `projectSlots`, `spawn`, `pets`. The current floor has 22 rooms, 27 desks, 42 seats and 22 points of interest. Room ids (`DIR`, `REU`, `PLN`, `ENG`, `QUA`, `SOC`, `PRJ1`–`PRJ4`, `ENT`, `SRV`, `BIB`, `REC`, `WC`, `COP`, `TER`, corridors) come from `docs/design/MAPA.md` and never change. Validation (`src/shared/world/mapValidation.ts`): unique ids; every desk, seat and point of interest on a walkable tile reachable from the entrance door; four project slots; all required rooms present.

## `uso/v1`

Defined and tested but not used until Phase 3. `{schema: "uso/v1", updatedAt, source?, sessionId?, model?, windows: {fiveHour?, sevenDay?}, spendLimit?, extraWindows?}`, where each window is `{usedPercentage, resetsAt (epoch seconds), observedAt?, stale?}`. Out-of-range percentages are accepted by the parser and clamped by the interface.

## Related

- [Customize the NPCs](../how-to/customize-npcs.md)
- [ADR-0008](../../adr/0008-team-and-map-config-contracts.md)
