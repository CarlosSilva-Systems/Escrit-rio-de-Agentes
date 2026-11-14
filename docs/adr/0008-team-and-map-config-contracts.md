# ADR-0008: Versioned config contracts — `escritorio.json` (`escritorio/v1`) and `mapa.json` (`mapa/v1`)

> **Resumo (pt-BR):** Dois arquivos de configuração versionados por um campo `schema`: `~/.claude/equipe/escritorio.json` (quem é quem: agentes, departamentos, mesas simbólicas, frases, mascotes, regra do Freelancer) e `assets/map/mapa.json` no repositório (o andar: salas, mesas com coordenadas, assentos, pontos de interesse, luzes, quadros, vagas de sala de projeto). O MAPA.md da Bianca é convertido para o `mapa.json`. Mesas são ligadas pelo **id do mapa da Bianca** (`PLN-02`), então nomes/cargos mudam sem mexer no mapa e vice-versa. Ambos são validados por JSON Schema gerado do zod; inválido → aviso + último válido.

- Status: Proposed
- Date: 2026-11-12
- Deciders: Artur, Bianca (map content); approval: Carlos

## Context
CA-12, CA-13, CA-17, CA-21, CA-11, CA-43, CA-65; PEDIDO §5 (escritorio.json with name, full name, title, department, sprite, desk, phrases) and §7 (map). Bianca designs the map in parallel (`docs/design/MAPA.md`); the rh-equipe skill must update `escritorio.json` on hire/adjust/fire.

## Decision
1. **`escritorio.json`** lives in `~/.claude/equipe/` (team data, edited by the skill). Schema `escritorio/v1` — full JSON Schema in `docs/projeto/2026-11-12-escritorio-equipe/escritorio.schema.json` (to be moved to `schemas/escritorio.v1.schema.json` in T-10). Key rules:
   - `agents[].agentType` = the agent's `name` (frontmatter) = hook `agent_type`; unique.
   - `agents[].desk` = desk id from `docs/design/MAPA.md` §6 (e.g. `PLN-02`, vacancies `<ROOM>-Vn`) that must exist in `mapa.json` `desks[]`; a desk may be held by one agent. Room ids also follow MAPA.md (`DIR`, `QUA`, `SOC`, `PRJ1`…).
   - Unknown `agent_type` at runtime → **Freelancer** instance (per `agent_id`), using `freelancer` block (visitor badge, spawns at reception (`homeRoom: REC`), works at provisional desks `FL-D1`/`FL-D2` or waits on the sofa `FL-S1`/`FL-S2`, leaves after Stop). When the type is later added to `agents[]`, active Freelancers of that type are replaced live (CA-17).
   - Hire with no free desk in its department → `desk: null` + `provisional: true` → provisional desk `FL-D1`/`FL-D2` + UI warning (CA-21).
2. **`mapa.json`** lives in the repo (`assets/map/mapa.json`, schema `mapa/v1`): `tileSize`, `cols`, `rows`, tile layers (by tileset ids), `collision` (walkable grid), `rooms[]` (id, kind, department, rect(s), doors, light group), `desks[]` (id, room, department, tile, facing, seat id, decor), `seats[]`, `pois[]` (id, kind ∈ coffee|water|fridge|snacks|copa-table|sofa|tv|arcade|pingpong|window|terrace|hammock|bathroom-door|director-door-wait|meeting-seat|reception-wait, interaction tiles, capacity, facing, activity), `lights[]`, `boards[]` (live boards: `metas`, `bugs`, `git-branches`, `tv-kanban`, `active-projects`, with rect and binding), `projectSlots[4]` (room id, door-sign rect, board rect, progress-bar rect, meeting seats), `spawn` (reception entry). Contract detailed in `docs/ARQUITETURA.md` §7.
3. Both validated at load with zod → JSON Schema; cross-file check: every `agents[].desk` exists, no desk assigned twice, every department has a room. Invalid file → diagnostics `{file, path, message}` to the UI, keep last valid (or minimal team from `QUADRO.md`) (CA-13).
4. Schema evolution: additive changes keep `v1`; breaking changes → `v2` plus a migration function in `src/shared/config/migrations.ts` and a new ADR.

## Alternatives considered
- Coordinates inside `escritorio.json`: couples team edits to map layout; rh-equipe would need map knowledge. Rejected.
- Tiled `.tmx`/`.tmj` as source: good editor, but adds a format/converter dependency; F-16 says no graphical editor needed. Bianca may still use Tiled and export JSON → converter task if she does (T-22 decides).

## Consequences
- (+) Team and map evolve independently; skill edits are simple JSON operations with a consistency test.
- (−) Two files to keep consistent → cross-file validation and `npm run team:check`.
