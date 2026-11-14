# Tutorial: first use

[🇧🇷 Português](../../pt-BR/tutorials/first-use.md) · [Documentation index](../README.md)

In about 15 minutes you will install Team Office, open it and learn the whole Phase 1 screen. You do not need to know anything about the code.

You need: Windows 11, Node.js 26 (`node --version` prints `v26.x`), Git, npm and Microsoft Edge or Chrome.

## 1. Install

Open a terminal (PowerShell) in the folder where you keep your projects.

```
git clone <repository-url> escritorio-equipe
cd escritorio-equipe
npm ci
npm run build
```

`npm ci` installs the exact locked versions; `npm run build` creates the `dist` folder. Both take a minute or two. The build ends without errors.

## 2. Open the office

Double-click `scripts\abrir-escritorio-dev.bat` (or run `npm run open`).

The console shows "Starting the Office…" and then "Opening the browser…" (the command line speaks the language saved in `config.json`, Portuguese by default), and your browser opens on `http://127.0.0.1:3200/` already signed in. The address bar shows no token: the shortcut handed the browser a one-time ticket that is already used up.

If the page says "Open the office from the shortcut" instead, you typed the address by hand. Close the tab and use the shortcut again.

## 3. Look at the screen

You see the office floor in pixel art with the top bar above it:

- **Studio name** on the left (a placeholder until `escritorio.json` exists) and the **Brasília clock**.
- **Agents n/16 working** and **Active projects**.
- Buttons: **Team**, **Sound**, **Language** and **Settings**.

When `~/.claude/equipe/escritorio.json` does not exist yet, a thin notice appears: "Using the reserve team from QUADRO.md: escritorio.json has not been created yet." The office still works: the team is read from `QUADRO.md`. You can dismiss the notice with **Dismiss**. To create the real file, see [Customize the NPCs](../how-to/customize-npcs.md).

A second notice may say "Claude Desktop sessions not detected". It is informational: see [See Claude Desktop sessions](../how-to/see-desktop-sessions.md).

## 4. Move around

1. Scroll the mouse wheel over the map. The zoom jumps between 2×, 3× and 4× (never blurry).
2. Drag the map with the left mouse button to move it. You can also use the arrow keys, `+` / `-` or the zoom buttons.
3. Click the minimap (bottom-right corner) to jump to that part of the floor.

## 5. Meet the NPCs

1. Move the pointer over a character. After a moment a card shows the full name, title, department, status and how long ago the status started.
2. Click the character. A side panel opens with the **Recent history**, **Current tasks** and a "Tokens today" line that shows "—" (it arrives in Phase 3).
3. Click on empty floor, or press `Esc`, to close the panel.

The status is always written in words as well as shown with an icon: "Idle", "Working on … in project …" or "Waiting for approval".

## 6. Use the Team drawer

1. Press the **Team** button. A list of every agent opens.
2. Press **Follow** on a row. The camera follows that NPC. The top shows "Following: <name>".
3. Press `Esc` (or **Stop following**) to let go. Moving the map by hand also stops following.

## 7. Try the keyboard

Press `?` to see the shortcut list (also in **Settings → Keyboard shortcuts**).

| Key | Opens |
|---|---|
| `C` | Chat with the Director (Phase 2: for now shows "This area arrives in the next steps.") |
| `T` | Tasks (Phase 3: placeholder) |
| `A` | Approvals "Needs you" (Phase 2: placeholder) |
| `M` | Map |
| `Esc` | Closes the innermost thing |

Shortcuts do not fire while you type in a text field. Press `Tab` to walk through every control; the focus is always visible.

## 8. Switch the language

Press the language button. Every text changes to English (or back to Portuguese) without reloading. Portuguese is the default.

## 9. See the office react (demo)

With no hooks installed, an idle office is quiet. To see movement, add a demo parameter to the address: `http://127.0.0.1:3200/?demo=8`. Eight demo characters walk around. Remove the parameter to go back. (Demo and debug parameters only change what you see; they never reach the server. See [controls reference](../reference/controls.md).)

To see a real agent working you need Claude Code activity: [See Claude Desktop sessions](../how-to/see-desktop-sessions.md).

## 10. Close

Closing the tab leaves the server running in the background (it uses almost no CPU). To stop it:

```
node dist/cli.js stop
```

To leave the office signed out, open **Settings → Sign out** and confirm; your Claude Code sessions are not affected. The next `npm run open` starts the server again and signs you in. If the browser later shows "Open the office from the shortcut" (the session expired), just run the shortcut again.

## Next steps

- [Customize the NPCs](../how-to/customize-npcs.md)
- [Troubleshooting](../how-to/troubleshooting.md)
- [Why it is built this way](../explanation/architecture.md)
