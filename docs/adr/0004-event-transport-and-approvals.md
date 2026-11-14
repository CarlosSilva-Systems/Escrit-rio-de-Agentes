# ADR-0004: Event transport and approvals — own command hook → local server, layered opt-in (no settings change by default)

> **Resumo (pt-BR):** Eventos chegam por um **hook do tipo `command`** próprio (`escritorio-hook.cjs`, Node sem dependências) que faz POST para `127.0.0.1:3200` com um token só de hooks. Em três níveis: **Nível 0 (padrão, sem mexer no settings.json):** sessões abertas pelo painel recebem os hooks via `--settings <arquivo>`; sessões do Desktop/terminal são observadas lendo os JSONL (sem aprovações, atraso ~1–2 s). **Nível 1 (recomendado, com diff + OK do Carlos):** acrescentar nossos hooks ao `settings.json` ao lado dos do Pixel Agents (nada é removido) → Desktop em tempo real e com aprovações. **Nível 2 (fase 3, opcional):** envolver a statusLine existente. `PermissionRequest` é bloqueante com prazo (60 s padrão) e, em qualquer falha, devolve "sem decisão" (fluxo normal do Claude). O diff exato está abaixo — **não aplicado**.

- Status: Proposed (settings.json changes require Carlos's explicit OK)
- Date: 2026-11-12
- Deciders: Artur; approval: Carlos

## Context
- [F] Claude Code supports `command` and native `http` hooks; `PermissionRequest` accepts a decision on stdout (`hookSpecificOutput.decision.behavior = allow|deny`); exit 0 without a decision, or a non-blocking error/timeout, falls back to the normal permission flow. Default hook timeout 600 s, configurable per hook. In non-interactive background subagents "no decision" = denied.
- [F] Current `~/.claude/settings.json` (read for structure only): keys `agent`, `statusLine`, `hooks`. `statusLine` runs Pixel Agents' `claude-statusline.js` (prints nothing; POSTs usage to 3100; supports `--wrap <base64url>`). `hooks` has one matcher group per event for 12 events, all running `node "C:\Users\carlo\.pixel-agents\hooks\claude-hook.js"` with `timeout: 5`. That script POSTs every payload to **all live servers listed in `~/.pixel-agents/servers/*.json`** (2 s timeout, never decides).
- Constraints: do not touch `~/.pixel-agents` nor the 3100 instance before phase 5; do not change `settings.json` without showing the diff (CA-20, CA-59); must work for sessions opened by Claude Desktop (CA-18); approvals must not hang sessions (CA-38, CA-39).
- Registering our server in `~/.pixel-agents/servers/` would give us the payloads for free, but writes into `~/.pixel-agents` (forbidden) and its 5 s timeout makes blocking approvals impossible. Rejected.
- [?] Whether hook arrays from `--settings` are **merged** with user-level hooks (expected) and whether `statusLine` from `--settings` overrides the user one → verified in spike S-03.

## Decision

### 1. Hook runtime
- `src/hook-runtime/escritorio-hook.cjs`: plain Node, no dependencies, copied by the installer to a stable path outside OneDrive: `C:/Users/carlo/.escritorio-equipe/bin/escritorio-hook.cjs` (versioned header + SHA-256 checked at server start).
- Reads stdin JSON, reads the **hook token** from `~/.escritorio-equipe/hook-token` (not the browser token), POSTs to `http://127.0.0.1:<port>/api/hooks/v1/claude` (port from `~/.escritorio-equipe/runtime.json`, default 3200).
- Observational events: connect timeout 300 ms, total 1 s, always exit 0, no stdout.
- `PermissionRequest`: two steps — `POST …/approvals` (≤ 1 s; failure ⇒ exit 0 without output ⇒ normal flow, CA-39) then long-poll `GET …/approvals/<id>/wait` up to the approval deadline (default 60 s, configurable 10–300 s). On `allow`/`deny` prints the decision JSON; on timeout/any error prints nothing and exits 0. **Never allows on error.**
- Hook `timeout` for PermissionRequest = approval deadline + 15 s (default 75 s) so Claude never kills it first.

### 2. Server side
- `/api/hooks/v1/claude` accepts only `Authorization: Bearer <hook-token>`, **rejects any request carrying an `Origin` header** (browsers always send it on cross-origin POST) and checks `Host`. Payload parsed with a tolerant schema (unknown fields kept in memory only, never logged).
- Events are deduplicated by `(session_id, hook_event_name, tool_use_id | agent_id, timestamp bucket)` so duplicate sources (settings + `--settings`, hooks + JSONL fallback) never double-count.

### 3. Layers (Carlos chooses)
| Level | What | Covers | settings.json change |
|---|---|---|---|
| **0 — default** | Panel sessions start with `--settings ~/.escritorio-equipe/claude-settings.json` (our hooks + our statusLine). External sessions (Desktop, other terminals) observed through the **JSONL watcher** (ADR-0006): sessions, subagents, tool use. | Everything visual; approvals and usage meter only for panel sessions. Desktop latency ≈ 1–2 s, no approvals from Desktop. | **None** |
| **1 — recommended (end of phase 1)** | Append our hook groups to `settings.json` (diff below). Panel sessions then skip hooks in `--settings` (installer marker detected) to avoid duplicates. | Desktop sessions in real time + approvals from Desktop in the inbox. | Additive only |
| **2 — optional (phase 3)** | Wrap the existing statusLine (diff below) so usage from external CLI sessions also reaches `uso.json`. Pixel Agents' statusline keeps running inside the wrapper. | Usage meter for CLI sessions outside the panel. Desktop likely never runs statusLine [F/I]. | Replace one value, reversible |

Installer commands (phase 1/3): `npm run settings:diff` (prints the unified diff, changes nothing), `npm run settings:apply -- --level 1|2` (requires typing `APLICAR`; writes `settings.json.bak-YYYYMMDD-HHMMSS` first; merges, never overwrites; validates JSON after write), `npm run settings:revert` (removes only entries whose command contains `.escritorio-equipe`, restores the wrapped statusLine).

### 4. Proposed diff — Level 1 (NOT applied)
Every existing group is kept byte-for-byte; one group is **appended** per event; three events that do not exist today are **added**.
```diff
   "hooks": {
     "SessionStart": [
       { "matcher": "", "hooks": [ { "type": "command", "command": "node \"C:\\Users\\carlo\\.pixel-agents\\hooks\\claude-hook.js\"", "timeout": 5 } ] }
+      ,{ "matcher": "", "hooks": [ { "type": "command", "command": "node \"C:/Users/carlo/.escritorio-equipe/bin/escritorio-hook.cjs\"", "timeout": 3 } ] }
     ],
```
Same appended group (timeout 3) for: `SessionEnd`, `Stop`, `Notification`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `SubagentStart`, `SubagentStop`, `TaskCompleted`. Not added to `TeammateIdle` (unused). For `PermissionRequest`:
```diff
     "PermissionRequest": [
       { "matcher": "", "hooks": [ { "type": "command", "command": "node \"C:\\Users\\carlo\\.pixel-agents\\hooks\\claude-hook.js\"", "timeout": 5 } ] }
+      ,{ "matcher": "", "hooks": [ { "type": "command", "command": "node \"C:/Users/carlo/.escritorio-equipe/bin/escritorio-hook.cjs\"", "timeout": 75 } ] }
     ],
```
New keys:
```diff
+    "UserPromptSubmit": [ { "matcher": "", "hooks": [ { "type": "command", "command": "node \"C:/Users/carlo/.escritorio-equipe/bin/escritorio-hook.cjs\"", "timeout": 3 } ] } ],
+    "TaskCreated":      [ { "matcher": "", "hooks": [ { "type": "command", "command": "node \"C:/Users/carlo/.escritorio-equipe/bin/escritorio-hook.cjs\"", "timeout": 3 } ] } ],
```
Keys `agent` and `statusLine` untouched at Level 1.

### 5. Proposed diff — Level 2 (NOT applied; phase 3)
```diff
   "statusLine": {
     "type": "command",
-    "command": "node \"C:\\Users\\carlo\\.pixel-agents\\hooks\\claude-statusline.js\""
+    "command": "node \"C:/Users/carlo/.escritorio-equipe/bin/escritorio-statusline.cjs\" --wrap bm9kZSAiQzpcVXNlcnNcY2FybG9cLnBpeGVsLWFnZW50c1xob29rc1xjbGF1ZGUtc3RhdHVzbGluZS5qcyI"
   }
```
The `--wrap` value is base64url of the previous command verbatim (`node "C:\Users\carlo\.pixel-agents\hooks\claude-statusline.js"`), same convention as Pixel Agents. Our script prints its own line, then runs the wrapped command with the same stdin (1 s timeout) and appends its non-empty output. `settings:revert` decodes and restores it.

### 6. Phase 5
Pixel Agents' hook groups and statusline wrapper are removed **only** with a new diff and Carlos's OK (CA-86).

## Alternatives considered
- **Native `http` hook type.** No Node spawn per event (faster), but the auth header needs an env var (`allowedEnvVars`) → token in `settings.json` `env` or in Carlos's user environment. Rejected for now; revisit if per-event spawn cost (~50–80 ms, async to the UI) becomes a problem.
- **Register in `~/.pixel-agents/servers/`.** Forbidden path; 5 s timeout. Rejected.
- **Project-level `.claude/settings.local.json` in each project.** Touches every repository. Rejected.
- **JSONL only (no hooks).** No approvals, higher latency, guesses for permission state. Kept as fallback (Level 0).

## Consequences
- (+) Works on day one with zero changes to Carlos's config; every escalation is additive, diffed, backed up and reversible.
- (+) Approvals never block a session for longer than the deadline and never auto-approve.
- (−) At Level 0, approvals from Desktop sessions are not in the inbox (Desktop shows its own dialog as today).
- (−) Two hook scripts run per event while Pixel Agents is installed (≈ +50–80 ms CPU each, in parallel; no visible impact expected — measured in S-03).
- Open [?]: whether the TUI dialog stays visible while our PermissionRequest hook waits; whether `ExitPlanMode` goes through PermissionRequest (CA-41) → S-03/S-01.
