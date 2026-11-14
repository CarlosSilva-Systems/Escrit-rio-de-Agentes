# Why a custom Canvas 2D engine

[🇧🇷 Português](../../pt-BR/explanation/why-canvas-2d.md) · [Documentation index](../README.md)

The decision record is [ADR-0002](../../adr/0002-rendering-canvas-2d.md); the measurements are in the spike report `docs/projeto/2026-11-12-escritorio-equipe/spikes/S-02-render.md` (Portuguese).

## The problem

The office must look crisp pixel art at 2×, 3× and 4× zoom (also at Windows scaling of 125 % and 150 %), animate about twenty characters and several lights, and still cost almost nothing when you leave the tab open all day.

## The decision

Draw the whole world into a small off-screen canvas at its native size (64×52 tiles of 16 px is only 1024×832 pixels), bake the static parts (floor, walls, furniture) once, and then paint the result onto the visible canvas with **one** scaled copy per frame using whole-number scaling and no smoothing. Because the cost is tied to the small native image, it hardly changes with zoom or window size, and the pixels stay perfectly sharp by construction.

The frame loop is ours: capped at 30 frames per second, slower (about 6 fps) when only ambient animation runs, completely stopped while the tab is hidden, and limited so nothing jumps when you come back.

## Alternatives

- **PixiJS** (WebGL): excellent for thousands of sprites or shader lighting, which this scene does not need. It adds a dependency, context-loss handling and GPU wake-ups even at low frame rates. Kept as a measured fallback.
- **Phaser**: a whole game framework with its own loop, input and scenes. It overlaps with React and with our own simulation and is the heaviest. Rejected.
- **DOM or CSS sprites**: hundreds of moving elements, layout cost and blurry edges at fractional scaling. Rejected.

## What the measurements say

- Tab hidden: zero frames drawn and about 0.2 % CPU. Resume takes a few milliseconds.
- Crispness: at DPR 1, 1.25 and 1.5 the screen contains no colour that is not in the native image.
- Never more than 28 frames in any second; bundle of 154 kB gzip for the whole app.
- Idle, tab visible: 3.3 % of one core (target 5 %). **The worst case, with 20 walking characters, rain and night, costs about 17.3 % against a 10 % target.** The cost follows the frame rate rather than the number of characters. The spike therefore recommends not switching to PixiJS yet: apply the cheap optimizations already identified (redraw only the dirty region, skip lighting passes when nothing changed, 20 fps when only one to three characters walk), measure again over 10 minutes with a visible window, and open a new ADR only if the result stays above 10 % with PixiJS clearly ahead. The final call belongs to the architect and the project owner. PixiJS was not compared because the plan limited the spike to measuring Canvas 2D first, and ADR-0002 is still marked "Proposed". See [Known limitations](limitations.md) and [Performance](../reference/performance.md).

## Related

- [Architecture](architecture.md)
- [ADR index](../adr/README.md)
