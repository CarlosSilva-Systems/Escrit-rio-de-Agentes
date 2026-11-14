# How to customize the NPCs and `escritorio.json`

[🇧🇷 Português](../../pt-BR/how-to/customize-npcs.md) · [Documentation index](../README.md)

Goal: change who sits where, their names, titles and phrases, or create the team file for the first time. Field details are in the [contracts reference](../reference/contracts.md).

## Before you start

- The file lives at `%USERPROFILE%\.claude\equipe\escritorio.json` (schema `escritorio/v1`).
- **It does not exist yet.** The project rule is to create it only after you approve the list of names (gate G1, see `docs/projeto/2026-11-12-escritorio-equipe/PROPOSTA-NOMES.md`, in Portuguese). Until then the office shows a team derived from `QUADRO.md` and a notice.
- The build must exist (`npm run build`), because the commands below run the compiled CLI.

## Create the file from the approved proposal

1. Review `docs/projeto/2026-11-12-escritorio-equipe/escritorio.proposta.json` and edit names, titles or phrases there if you want.
2. Check it against `QUADRO.md` and the map without writing anything:

   ```
   npm run team:check -- --escritorio docs/projeto/2026-11-12-escritorio-equipe/escritorio.proposta.json
   ```

   Expected: `OK: team is consistent.` (or `OK: equipe consistente.`) and exit code 0.
3. Write the real file. The command refuses to run without the explicit confirmation flag:

   ```
   npm run team:init -- --confirm-approved
   ```

   It prints `Written: <path>`. If the destination already exists nothing is changed unless you add `--overwrite`, which first saves a backup next to it (`escritorio.json.bak-<date>`).
4. Run `npm run team:check` again, this time without options. It compares the real `escritorio.json`, `QUADRO.md` and `assets/map/mapa.json`.

## Change an existing agent

1. Open `%USERPROFILE%\.claude\equipe\escritorio.json` in an editor.
2. Edit the agent entry. Keep `agentType` equal to the agent's file name in `~/.claude/agents/` (it is also what Claude Code sends as `agent_type`). Useful fields:
   - `nickname` (up to 24 characters), `fullName`, `title`.
   - `desk`: a desk id from the map such as `ENG-02`. It must exist in `assets/map/mapa.json` and belong to a room of the agent's department.
   - `phrases`: up to 50 lines, each up to 120 characters.
3. Save. The server watches the file: the office updates in a moment, without reloading the page.
4. Run `npm run team:check`. Fix every `ERROR` and `WARNING` it lists.

## Give an agent a temporary desk

If a department has no free desk, set `"desk": null` and `"provisional": true`. The NPC takes a provisional desk in the Reception and the panel shows a notice.

## If you make a mistake

An invalid file never breaks the office. The server keeps the last valid team, and a notice names the file and the field (for example `Problem in escritorio.json · agents: …. Keeping the last valid configuration.`). Fix the field and save again: the file is reread automatically.

## Related

- [Contracts reference](../reference/contracts.md)
- [See a new hire arrive](see-new-hires.md)
- [CLI reference: `team:check`, `team:init`](../reference/cli.md)
