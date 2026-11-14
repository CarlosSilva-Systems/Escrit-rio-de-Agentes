# How to log out

[🇧🇷 Português](../../pt-BR/how-to/log-out.md) · [Documentation index](../README.md)

Goal: make sure nobody can use the office from this browser any more.

> **There is no "Log out" button in the interface yet.** The server has a logout route, but nothing in Phase 1's screen calls it. Use one of the options below.

## Option A: sign out every browser (recommended)

Rotate the token. It invalidates all sessions at once and closes open tabs' connections:

```
node dist/cli.js token:rotate
```

Details: [Rotate the access token](rotate-token.md).

## Option B: forget this browser only

1. In the browser, open the site settings for `127.0.0.1` and delete its cookies (look for the cookie `esc_sid`). In Edge: padlock or tune icon in the address bar → Cookies → remove.
2. Reload the page. It shows "Open the office from the shortcut".

The session also ends by itself: after **8 hours without use**, or **24 hours after it started**, whichever comes first. Then reopen the office from the shortcut (`npm run open`).

## What does not log you out

- Closing the tab or the browser: the cookie stays valid until it expires.
- Stopping the server (`node dist/cli.js stop`): sessions are saved (as hashes) and survive a restart.

## Related

- [Rotate the access token](rotate-token.md)
- [Local security model](../explanation/security.md)
