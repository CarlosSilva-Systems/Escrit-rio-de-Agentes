# How to log out

[🇧🇷 Português](../../pt-BR/how-to/log-out.md) · [Documentation index](../README.md)

Goal: make sure nobody can use the office from this browser any more.

## Sign out from the interface

1. Press **Settings** in the top bar.
2. Choose **Sign out**.
3. A dialog asks "Sign out of the office?" and warns that to come back you must open the office again from the shortcut. Your Claude Code sessions are not affected. Confirm with **Sign out**.

The server forgets this browser's session, the cookie is removed and the page shows "Open the office from the shortcut" without reloading. To get back in, run the shortcut or `npm run open`.

## Alternatives

- **Sign out every browser at once:** rotate the token with `node dist/cli.js token:rotate` ([Rotate the access token](rotate-token.md)).
- **Forget this browser from the browser side:** delete the cookie `esc_sid` of `127.0.0.1` in the browser's site settings, then reload.

## When a session ends by itself

After **8 hours without use** (the 8 hours restart each time you use the office) or **24 hours after it started**, whichever comes first. Reopen from the shortcut.

## What does not log you out

- Closing the tab or the browser: the cookie stays valid until it expires.
- Stopping the server (`node dist/cli.js stop`): sessions are saved (as hashes) and survive a restart.

## Related

- [Rotate the access token](rotate-token.md)
- [Local security model](../explanation/security.md)
