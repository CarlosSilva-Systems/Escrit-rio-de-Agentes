# ADR-0006: Data sources, tolerant readers and persistence (`~/.escritorio-equipe/`)

> **Resumo (pt-BR):** Estado vivo em memória no servidor; persistência mínima em `~/.escritorio-equipe/` (fora do OneDrive), com escrita atômica. Fontes: (1) **PLANO.md/TAREFAS.md** (parser puro e tolerante, contrato em `docs/ARQUITETURA.md` §8) — fonte principal das tarefas; (2) **hooks** Subagent*/Task*/ferramentas — sobrepõem o status "ao vivo"; (3) **JSONL** de `~/.claude/projects` — tokens (dedupe por `message.id`, subagentes por `.meta.json`), fallback de eventos e conteúdo do chat; (4) **uso.json** gravado pela nossa statusLine (Node puro). Só agregados são persistidos.

- Status: Accepted (2026-11-13, approved by the project owner)
- Date: 2026-11-12
- Deciders: Artur; approval: Carlos

## Context
- PEDIDO §3/§4; CA-48…CA-64; privacy §5.3. JSONL is an internal format that changes between versions [F]; folder slug decoding is ambiguous → use the `cwd` field inside the file [F]. Subagents: `<session>/subagents/agent-<id>.jsonl` + `.meta.json` (`agentType`) [F]. `usage` dedupe key [?].
- Task tool events: `TaskCreate/Update/…` tools and `TaskCreated/TaskCompleted` hooks exist; `tool_input` fields [?] → S-03 fixtures.
- statusLine stdin has `rate_limits.five_hour|seven_day {used_percentage, resets_at}` only after the first API response, each window may be absent; `spend_limit` only behind a gateway; **no per-model window** [F]. Desktop likely does not run statusLine [F/I].
- Pedido fixes `~/.claude/equipe/uso.json` and `~/.claude/equipe/escritorio.json`.
- The repo lives in OneDrive; runtime data must not.

## Decision

### Locations
| Path | Owner | Content |
|---|---|---|
| `~/.claude/equipe/escritorio.json` | rh-equipe skill / Carlos | team config (schema `escritorio/v1`) |
| `~/.claude/equipe/uso.json` | our statusLine script | last usage reading (schema `uso/v1`) |
| `~/.escritorio-equipe/token`, `hook-token` | server | secrets (ACL user-only) |
| `~/.escritorio-equipe/config.json` | server (UI settings, closed list) | lang, sound, music, chat.mode per project, approval deadline, quality, devRoot override |
| `~/.escritorio-equipe/state.json` | server | room assignments, celebrated projects, alert arming per window cycle, NPC recent history (metadata only, 50/agent), panel session index (ids, project, created, title ≤ 80 chars from first prompt — see below) |
| `~/.escritorio-equipe/cache/tokens.json` | server | token aggregates + per-file read offsets |
| `~/.escritorio-equipe/runtime.json` | server | port, pid, version (for launcher/hook) |
| `~/.escritorio-equipe/logs/` | server | daily logs, 7-day retention |
| `~/.escritorio-equipe/bin/` | installer | `escritorio-hook.cjs`, `escritorio-statusline.cjs` |
| `~/.escritorio-equipe/claude-settings.json` | server | file passed via `--settings` (ADR-0004) |

All writes: write temp file in the same folder → `rename` (retry up to 10× with growing delay on `EPERM/EBUSY/EACCES`, Windows; single implementation in `src/server/home/fsAtomic.ts`) — debounced (≥ 1 s) for `state.json`. Readers retry once on parse error (partial write) and keep the last good value.
History title: the first prompt is reduced to its first 80 characters for the history list (CA-36). This is the only conversation-derived text persisted; can be disabled (`history.storeTitles=false`). → **Carlos decides** (privacy vs. usability; default on, masked).

### PLANO.md reader (tasks — primary source)
- Watch `<devRoot>/*/docs/projeto/*/{PLANO.md,TAREFAS.md}` (native `fs.watch` recursive per project + 2 s debounce + periodic 60 s rescan for new folders). Parser is a **pure function** in `src/shared/plan/` (contract in `docs/ARQUITETURA.md` §8). Errors become `diagnostics[]` with line numbers (CA-49), never exceptions.
- Kanban set of tasks = PLANO/TAREFAS tables (precedence, CA-52). Live overlay: SubagentStart for agent X in project P marks P's tasks of X with status "A fazer" as `liveActive` (badge "trabalhando agora") — it **does not rewrite the file status**; Claude task events (TaskCreated/Completed) are shown as a separate lane "Tarefas da sessão" when they cannot be matched to a T-ID (match rule: subject contains `T-\d+`).

### JSONL reader (tokens, fallback events, chat transcript)
- Incremental tail per file (offset + size + mtime in cache), line-by-line JSON.parse in try/catch, unknown/corrupt lines counted (`ignoredLines`, CA-63).
- **Tokens:** for each assistant line with `message.usage`: dedupe key = `message.id` (fallback `requestId`, fallback `uuid`); keep the max of each counter per key (streamed blocks repeat usage). Aggregate by (day in America/Sao_Paulo, project = first segment of `cwd` relative to devRoot or "Fora de 7 - DEV:<basename>", agent = `agentType` from sibling `.meta.json` for subagent files, else the session's main agent, default `chefe`, model). Counters: input, output, cache_read, cache_creation. Only aggregates persisted (CA-64). Dedupe rule verified with real files in S-05.
- **Fallback events** (Level 0, ADR-0004): new subagent file → synthetic `SubagentStart{agent_type from meta}`; no writes for 120 s or a final assistant message → synthetic `SubagentStop`; tool_use blocks → synthetic tool events. Marked `source:"jsonl"`, lower priority than hooks for the same ids.
- **Chat transcript** (ADR-0003): read on demand for panel sessions; streamed to the client, never persisted by us.
- Retention follows Claude Code (30 days); aggregates in our cache are kept 400 days (small).

### Statusline script and uso.json
- `src/hook-runtime/escritorio-statusline.cjs` (no deps, CommonJS): read stdin (≤ 1 MB, 500 ms cap) → parse → print one line, e.g. `chefe · escritorio-equipe · 5h 42% (2h13) · 7d 18% (3d4h)`; if `rate_limits` present, merge per window into `uso.json` (a window missing in this reading keeps its previous value with `stale:true` if its `resets_at` passed); write atomically; never overwrite a good value with empty; exit 0 always (CA-58). Then run the `--wrap` command if any (ADR-0004 Level 2). Target ≤ 200 ms (measured).
- `uso.json` schema `uso/v1`:
```json
{
  "schema": "uso/v1",
  "updatedAt": "2026-11-12T22:10:05.120Z",
  "source": "statusline",
  "sessionId": "uuid",
  "model": "claude-opus-5-5",
  "windows": {
    "fiveHour": { "usedPercentage": 42, "resetsAt": 1794530000, "observedAt": "2026-11-12T22:10:05.120Z" },
    "sevenDay": { "usedPercentage": 18, "resetsAt": 1794900000, "observedAt": "2026-11-12T22:10:05.120Z" }
  },
  "spendLimit": null,
  "extraWindows": {}
}
```
  `spendLimit`/`extraWindows` are pass-through if Claude Code ever sends them (CA-62); otherwise absent/empty and hidden in UI.
- Server watches `uso.json` (fs.watch + 10 s stat fallback), computes staleness ("atualizado há X min" after 2 min, CA-61), alert arming (80 %/95 % once per window cycle keyed by `resetsAt`, hysteresis 2 points, CA-60) and persists arming in `state.json`.

### State in memory vs disk
In memory: NPC logical status, sessions, approvals (never persisted: an approval cannot survive a restart — the hook falls back), activity feed (ring buffer 500, metadata only), plan models, usage. On restart the server rebuilds from files + JSONL tails of the last 15 min.

## Alternatives considered
- **SQLite** for aggregates/history: more robust queries, but a native dependency and overkill for KBs of data. Rejected (revisit if aggregates exceed ~5 MB).
- **Persist under `~/.claude/equipe/`**: mixes our runtime with team config and Claude Code's tree. Only the two files required by the request go there.
- **Polling only**: higher CPU. Native `fs.watch` (ReadDirectoryChangesW) + debounce + slow fallback rescan chosen.

## Consequences
- (+) Server restarts are cheap; nothing sensitive persisted; data outside OneDrive.
- (−) Format drift of JSONL/hook payloads needs maintenance → tolerant schemas, fixtures from real (anonymized) captures, "N linhas ignoradas" visible.
