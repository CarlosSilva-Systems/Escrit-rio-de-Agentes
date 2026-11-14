# Privacy and zero token cost

[🇧🇷 Português](../../pt-BR/explanation/privacy-and-cost.md) · [Documentation index](../README.md)

## What is never stored or logged

Team Office shows *who* is doing *what kind* of work, not *what was said*. By design it never persists or logs:

- prompts you typed, answers from Claude, assistant text;
- tool inputs (`tool_input`), tool outputs, the content of files;
- the summary text of a subagent's task;
- tokens, cookies or one-time tickets (log lines are scrubbed for them).

What it does keep in memory or on disk is metadata: event kinds, agent types and ids, session ids, tool **names** and categories (edit, read, command, web, delegate, task, plan, other), the project folder name taken from the working folder, timestamps and counters. The last 500 activity items live in memory only and vanish when the server stops. On disk there are only your token files, `config.json`, hashed browser sessions, `runtime.json` and rotating logs (7 days).

Where the filter sits:

- **Hook script**: only an allow-list of short fields leaves the process; `tool_input`, tool responses, prompts and assistant text are dropped *before* anything goes over the network. The hook sends only to `127.0.0.1`.
- **Session-file reader (Level 0)**: its parser keeps ids, tool names and counters; no text ever leaves it.
- **Tests**: "canary" strings planted in prompts, unknown fields, headers and huge tool inputs must never appear in any state, response or log. This is checked automatically.

Nothing is sent to the internet. A test confirms the browser talks only to `127.0.0.1` and that no `claude` process is started in Phase 1.

## Zero token cost

The office itself spends **no tokens**. In Phase 1 it never runs `claude -p`, never uses the Agent SDK and never calls a paid API; it only reads files and receives local events. The project rule is that no paid call happens without your explicit action. The tests use a fake Claude (`tests/fixtures/fake-claude.mjs`).

This matters because, on subscription plans, programmatic use of Claude can draw on a separate credit. From Phase 2 the chat will default to a normal interactive Claude Code session in a terminal (which counts against your normal limits, like using Claude yourself), and an automatic `claude -p` mode will exist only if you turn it on, with a clear cost warning. The details and the billing question are in [ADR-0003](../../adr/0003-chat-session-mode.md), which is still waiting for your confirmation.

## Related

- [Local security model](security.md)
- [See Claude Desktop sessions](../how-to/see-desktop-sessions.md)
