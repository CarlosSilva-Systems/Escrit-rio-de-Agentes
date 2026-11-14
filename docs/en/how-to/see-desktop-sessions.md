# How to see Claude Desktop sessions in the office

[🇧🇷 Português](../../pt-BR/how-to/see-desktop-sessions.md) · [Documentation index](../README.md)

Goal: make agents called from Claude Desktop (or any terminal) show up as NPCs that start working.

> **Status today: nothing has been applied to your `~/.claude/settings.json`.** Level 0 works on its own. Level 1 is a change you approve and apply yourself, and it is reversible. The exact proposed diff is in `docs/projeto/2026-11-12-escritorio-equipe/DIFF-settings-nivel1.md` (Portuguese).

## Level 0 or Level 1?

| | Level 0 (default) | Level 1 (recommended) |
|---|---|---|
| Changes `settings.json` | No | Yes, additive, with backup |
| How the office learns | Reads the session files in `%USERPROFILE%\.claude\projects` | Claude Code runs our small hook on each event |
| Delay | about 1–2 s | about 0.14 s (measured p95) |
| Approvals from the panel | No | Prepared for Phase 2 |
| Panel-opened sessions (Phase 2) | Hooks are passed with `--settings` | Same |

If the office sees no event at all and Level 1 is not installed, the notice "Claude Desktop sessions not detected" appears. It is quiet and can be dismissed.

## Use Level 0

Nothing to do: it is always on while the server runs. It only follows files that were recently active and never replays old history. If your Claude data lives elsewhere, set `ESCRITORIO_CLAUDE_HOME` (see the [environment reference](../reference/environment.md)).

## Install Level 1

Do this in a terminal in the project folder, with a successful `npm run build` behind you.

1. Copy the hook script to the runtime folder. This does not touch `settings.json`:

   ```
   npm run hooks:sync
   ```

   Output: `Copied to <you>\.escritorio-equipe\bin: escritorio-hook.cjs (hook version: …)`, plus the location of the panel's `claude-settings.json`.
2. Look at the proposed change. This only reads your `settings.json` and writes nothing:

   ```
   npm run settings:diff -- --level 1
   ```

   You get a summary (`Hook events to add (13): SessionStart, SessionEnd, …`) and a unified diff. Existing groups, including those of the installed Pixel Agents, stay untouched; ours are added after them. Nothing is removed.
3. Optional rehearsal on a copy of the file: copy your `settings.json` somewhere, then run `npm run settings:apply -- --level 1 --settings-file <copy> --confirm APLICAR` and inspect the copy.
4. Apply for real, **only when you have read and approved the diff**:

   ```
   npm run settings:apply -- --level 1 --i-am-carlo-and-approved
   ```

   - The command needs an **interactive terminal** and asks `Type APLICAR to apply:`. You must type the word `APLICAR` yourself.
   - On the real `settings.json` the `--confirm` option is ignored and a non-interactive run (script, scheduled task, piped input) is refused. This is on purpose: no program can approve the change for you.
   - Without `--i-am-carlo-and-approved` the real file is refused.
   - Before writing, it saves `settings.json.bak-<date>-<time>` next to the file and validates the JSON afterwards (restoring the original if validation fails). It prints `Applied. Backup: <path>`.
5. Check: start a Claude session that calls an agent. The NPC starts working in about a second.

## Undo

```
npm run settings:revert -- --i-am-carlo-and-approved
```

It also needs an interactive terminal and `APLICAR`. It removes only entries containing the marker `.escritorio-equipe` and restores the original bytes when the backup still matches.

## About Level 2

`--level 2` (wrapping the status line to feed the usage meter) belongs to Phase 3 and its script (`escritorio-statusline.cjs`) does not exist yet. Do not apply it.

## What the hook sends

Only event names and identifiers (session, agent type and id, tool name, folder). Never prompts, answers, tool inputs or outputs. It always exits with code 0 and never blocks Claude Code. In Phase 1 it only observes; it never decides anything.

## Related

- [Troubleshooting](troubleshooting.md)
- [Privacy and zero token cost](../explanation/privacy-and-cost.md)
- [CLI reference](../reference/cli.md)
