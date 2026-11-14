# How to see a new hire arrive in the office

[🇧🇷 Português](../../pt-BR/how-to/see-new-hires.md) · [Documentation index](../README.md)

Goal: when a new agent joins the team (or leaves), watch the office react.

## What you will see

- **Hire:** the new NPC walks in through the Reception door to its desk, and a notice reads "New on the team: <name>". The desk is the free desk of the right department; with none free, a provisional desk in the Reception and the notice "<name> got a provisional desk in the Reception: no free desk in the department."
- **Departure:** the NPC plays a short farewell scene and a notice reads "<name> left the team".
- **Unknown agent types** (for example `general-purpose`, or a hire that is not in `escritorio.json` yet) show up as a temporary **Freelancer** with a visitor badge. When the type is added to the team file, the Freelancer is replaced by the real NPC without reloading.

## Steps

1. Keep the office open in the browser.
2. Add (or remove) the agent entry in `%USERPROFILE%\.claude\equipe\escritorio.json`, following [Customize the NPCs](customize-npcs.md). Use a free desk id, for example one of the `<ROOM>-V1` vacancies.
3. Save the file. Within a moment the welcome (or farewell) scene plays.
4. Run `npm run team:check` to confirm `QUADRO.md`, `escritorio.json` and the map agree.

## Current limitation

The `rh-equipe` skill (which hires, adjusts and dismisses agents) **does not edit `escritorio.json` yet**. It will be updated after you approve the name list (gate G1), so that every hire also adds the entry and runs `team:check`. Until then, edit the file by hand as above.

## Related

- [Customize the NPCs](customize-npcs.md)
- [Known limitations](../explanation/limitations.md)
