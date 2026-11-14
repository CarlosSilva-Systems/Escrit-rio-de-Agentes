# Hook fixtures are PROVISIONAL

Spike S-03 (real Claude Code CLI) could not run: `claude` is not installed. These payloads are
SYNTHETIC, derived from PESQUISA.md section C. Points marked [?] to validate against a real session:

- Whether `agent_id` has an `agent-` prefix (the normalizer strips it either way).
- Whether the main thread under `--agent chefe` carries `agent_type` (and no `agent_id`).
- The shape of `task` in TaskCreated/TaskCompleted (`id`/`subject`/`title` assumed).
- Whether tool events inside a subagent carry `agent_id`/`agent_type`.
- Which `notification_type` values exist besides permission_prompt, idle_prompt, agent_needs_input.
- Whether `ExitPlanMode` goes through PermissionRequest.
- Whether hooks from `--settings` merge with user-level hooks.
Every CANARY-* string must never appear in events, state, logs or diagnostics.
