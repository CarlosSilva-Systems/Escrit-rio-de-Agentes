# Reference: keyboard and mouse controls

[🇧🇷 Português](../../pt-BR/reference/controls.md) · [Documentation index](../README.md)

## Keyboard

Single-letter shortcuts never fire while you type in a text field or the terminal, and never with Ctrl, Alt or Meta pressed. No shortcut ever approves or denies anything.

| Key | Action |
|---|---|
| `C` | Toggle the Chat panel (placeholder until Phase 2) |
| `T` | Toggle the Tasks panel (placeholder until Phase 3) |
| `A` | Toggle the Approvals panel, "Needs you" (placeholder until Phase 2) |
| `M` | Toggle the Map panel |
| `?` | Open the shortcut list |
| `Esc` | Close the innermost layer (order below) |
| Arrow keys | Move the map (stops following an NPC) |
| `+` or `=` / `-` | Zoom in / out |
| `Tab`, `Shift+Tab` | Move focus through every control; the focus ring is always visible |
| `Enter`, `Space` | Activate the focused control (for example open an NPC's panel from the Team list) |

`Esc` closes things in this order, one per press: dialog (Credits, Shortcuts) → Settings menu → NPC panel (with its hover card) → hover card → Team drawer → following an NPC → the C/T/A/M panel.

## Mouse

| Gesture | Action |
|---|---|
| Wheel over the map | Zoom between 2×, 3× and 4× (integer steps, anchored at the pointer) |
| Drag with the left button | Move the map; stops following |
| Pointer over an NPC | Hover card (name, title, department, status, time) within 150 ms |
| Click an NPC | Open its panel (recent history, current tasks, tokens) |
| Click empty floor | Close the NPC panel |
| Click the minimap | Centre the camera there |

## Top bar

Team (opens the drawer with a Follow button per NPC), Sound (on/off), Language (pt-BR ⇄ en, no reload), Settings (Credits, Keyboard shortcuts).

## Developer URL parameters

Add them to the address after signing in. They change only how the page looks; nothing reaches the server.

| Parameter | Effect |
|---|---|
| `?debug` | Debug overlay (frames per second, frame time p95, zoom, density, map and sprite status) |
| `?demo=N` | N demo walkers, 0–64 |
| `?seed=N` | Random seed for the demo and routines |
| `?zoom=2\|3\|4` | Initial zoom |
| `?debugTime=2026-12-24T21:00` | Simulated studio time |
| `?rain` | Rain effect (visual test) |
| `?dirty=0` | Redraw the whole world every frame (performance comparison) |
| `?quality=auto\|high\|medium\|low` | Rendering quality |

## Behaviours worth knowing

- A hidden browser tab draws zero frames; when you come back, NPCs whose status changed jump straight to the right place.
- With `prefers-reduced-motion`, NPCs jump to their destination instead of walking and decorative animation stops; the status is still written in text.
- The drawing never exceeds 30 frames per second; an idle office renders about 6.

## Related

- [First use](../tutorials/first-use.md)
- [Measured performance](performance.md)
