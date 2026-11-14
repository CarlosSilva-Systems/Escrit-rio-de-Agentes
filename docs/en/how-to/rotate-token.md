# How to rotate the access token

[🇧🇷 Português](../../pt-BR/how-to/rotate-token.md) · [Documentation index](../README.md)

Goal: replace the secrets that protect the office (for example after sharing your screen or suspecting that someone read the token files) and sign out every browser.

## Steps

1. Run:

   ```
   node dist/cli.js token:rotate
   ```

   It prints: `Tokens regenerated. Every browser session was invalidated; use "escritorio open" to sign in again.`
2. Sign in again:

   ```
   npm run open
   ```

## What happens

- New master token and new hook token are written (256 bits each, user-only permissions). The old ones stop working at once.
- The saved browser sessions (`sessions.json`) are deleted.
- A running server notices the changed files by itself, within about a second, forgets every session and closes open WebSockets with code `4401`. Open tabs then show "Open the office from the shortcut" and do not reconnect in a loop.
- You do not need to restart the server, and you do not need to touch the Claude Code hooks: the hook script reads `hook-token` from disk on every run.

## When the server is stopped

The command works the same: it only rewrites the files. The next start uses the new tokens.

## Related

- [Log out](log-out.md)
- [Local security model](../explanation/security.md)
- [Files reference](../reference/files.md)
