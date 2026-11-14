# ADR-0003: Chat session mode — interactive PTY session (default) + structured transcript; `claude -p` stream-json as an opt-in driver

> **Resumo (pt-BR):** Padrão = **sessão interativa** real do `claude --agent chefe` num pseudo-terminal (ConPTY via node-pty), como o Carlos pediu, mas **sem raspar a TUI**: o chat é montado a partir do **transcript JSONL** da própria sessão (estruturado) e dos hooks; a aba Terminal mostra o PTY cru. O modo "Automático" (`claude -p --output-format stream-json`) existe como driver alternativo, ligado por configuração. A pesquisa indica que, no plano de assinatura, **os dois modos consomem o mesmo limite 5h/7d** — o aviso de custo do CA-34 precisa ser reescrito (Carlos confirma). O **spike S-01** (node-pty no Node 26 + claude no ConPTY) é obrigatório antes da fase 2.

- Status: Proposed (final after spike S-01 and Carlos's billing confirmation — CA-35)
- Date: 2026-11-12
- Deciders: Artur; spike: Bruno (dev-backend); approval: Carlos

## Context
- PEDIDO §2 wants a normal interactive Claude Code session with the `chefe` agent driven from the panel, formatted replies in the chat, a raw "Terminal" tab (xterm.js), history per project and `--resume`. The "Automatic" mode (`-p`) was to be opt-in **because it would consume a separate Agent SDK credit**.
- Research B [F]: that billing change was **paused on 2026-06-15**; with plan login, `claude -p` and the Agent SDK consume the **same 5h/7d limits** as interactive use. Monthly API credits apply only with an API key. Pages are dated vaguely → Carlos must confirm with `/usage` (gate CA-35).
- Research C [F]: `claude --agent chefe --session-id <uuid>` ties hooks to our session id; `--resume <id>` restores the agent; a "Resume this conversation?" dialog may appear on long sessions; `--settings <file>` exists. node-pty 1.1.0 (official, prebuild + node-gyp fallback) and `@lydell/node-pty` 1.2.0-beta.18 (prebuilt N-API binaries for win32-x64, used by Pixel Agents) — **none tested on Node 26** [?].
- Finding while planning [F]: **no `claude` CLI is on PATH in Carlos's environment** (`where claude` finds nothing; only Claude Desktop is installed). Both drivers need the official CLI → installing it (native installer, per-user) needs Carlos's OK (restriction "do not install anything global").
- ToS [F/I]: personal use of the official, unmodified binary with one's own login is allowed; no explicit rule about driving the interactive TUI through a PTY ("absence of a rule ≠ permission"). `-p` is the documented headless interface. We never read OAuth tokens.
- TUI scraping is fragile: ANSI redraws, spinners, layout changes between versions.

## Decision
1. **Driver abstraction** in the server: `SessionDriver` with two implementations, selected per session by a closed config value `chat.mode ∈ {"interactive","automatic"}` (default `"interactive"`).
2. **`interactive` driver (default):**
   - Spawns the resolved `claude` executable (absolute path, `.exe`; never `cmd /c`, never a shell) with argv built only on the server: `--agent chefe --session-id <uuid>` (new) or `--resume <id>` (resume, id validated against the project's transcripts), optional `--settings <file>` (ADR-0004), `cwd` = validated project folder.
   - **Input:** text written to the PTY using bracketed paste (`ESC[200~ … ESC[201~`) followed by `\r`; queued while the session is busy. Busy/idle comes from hooks (`UserPromptSubmit` → busy, `Stop` → idle), not from screen parsing.
   - **Chat output:** tail of the session's **transcript JSONL** (`transcript_path` from hooks, or `~/.claude/projects/<slug>/<session-id>.jsonl`), rendered as messages (assistant text as sanitized markdown, tool calls as compact cards). No TUI scraping for content.
   - **Terminal tab:** raw PTY bytes over a dedicated WebSocket to xterm.js; read-only by default (ADR-0005).
   - **Known dialogs** (workspace trust, "Resume this conversation?") are detected by a small allowlist of screen patterns and surfaced as a card "the session is waiting in the Terminal tab" — the panel never auto-answers them.
   - Lifecycle: max 4 sessions, kill the process tree on close/shutdown (ConPTY), state `starting|idle|busy|waiting-input|exited|error`.
3. **`automatic` driver (opt-in):** `claude -p --agent chefe --output-format stream-json --input-format stream-json --verbose [--include-partial-messages] --session-id/--resume …`, a long-lived process per session fed with JSON user messages. Same permissions path (PermissionRequest hook). Enabled per project with a confirmation dialog whose text comes from the confirmed billing rule (CA-34).
4. Default stays `interactive` (Carlos's explicit wish, fidelity with Desktop and the Terminal tab). **Recommendation to Carlos:** since billing is the same, consider `automatic` as an automatic fallback when the PTY spike fails or a PTY session errors — this is a decision for him.

### Spike S-01 (blocking for phase 2)
On Node 26.13.1 / Windows 11: install (project-local) `@lydell/node-pty@1.2.0-beta.18` and `node-pty@1.1.0`; for each: spawn `claude --agent chefe --session-id <uuid>` in ConPTY with `cwd` containing spaces/accents; send a multi-line message via bracketed paste; measure (a) time from send to first transcript line, (b) transcript write granularity (per message vs per block), (c) resize, (d) kill tree → no orphan `claude`/`conhost` processes, (e) `--resume` dialog behavior, (f) behavior while a PermissionRequest hook is pending (is the TUI dialog shown? — shared with S-03). Also test the `automatic` driver end to end. Output: `docs/projeto/2026-11-12-escritorio-equipe/spikes/S-01-pty.md` with numbers and the chosen package (pinned exact version).

## Alternatives considered
- **PTY + TUI scraping for the chat.** Highest fidelity, highest fragility (breaks on every TUI change). Rejected; the transcript is structured and already the source of history/resume.
- **`-p` only.** Most robust and documented, but no real TUI for the Terminal tab and departs from what Carlos asked. Kept as opt-in driver.
- **Agent SDK in-process.** More code, same billing per research, no TUI. Rejected.

## Consequences
- (+) Chat content is robust (JSON) while keeping a real interactive session and raw terminal.
- (+) Switching modes is a config value; both drivers share hooks, approvals, history.
- (−) "Real time" in interactive mode is per transcript write (message/block granularity), not per token; CA-32's "≤1 s after the text appears" is measured against the transcript write — confirm in S-01. If granularity is too coarse, the automatic driver with `--include-partial-messages` is the fallback for streaming.
- (−) Depends on native module on Node 26 and on the CLI being installed (Carlos's OK).
- Risk: transcript format is internal and may change → tolerant parser + fixtures (ADR-0006).
- Risk (ToS): low for personal local use [I]; documented, no credential handling.
