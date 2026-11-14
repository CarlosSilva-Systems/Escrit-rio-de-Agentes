# ADR-0002: Rendering — custom Canvas 2D engine (PixiJS as measured fallback, Phaser rejected)

> **Resumo (pt-BR):** Recomendo **Canvas 2D próprio**, sem dependência, renderizando o mundo em resolução nativa (1×, 960×640 px) num canvas fora da tela, com iluminação por camada de multiplicação, e ampliando por zoom inteiro com `imageSmoothingEnabled=false`. Phaser fica descartado (pesado e duplica o que o React faz). O **spike S-02** compara Canvas 2D × PixiJS 8 com critérios medíveis; se o Canvas 2D reprovar, um novo ADR adota o PixiJS.

- Status: Proposed (final after spike S-02)
- Date: 2026-11-12
- Deciders: Artur (architect), Lívia (dev-web) for the spike; approval: Carlos

## Context
Requirements: 16×16 tiles, 16×32 characters, integer zoom 2×/3×/4× without blur (PEDIDO §7, CA-80), ~60×40 tile map in the request, **64×52 in Bianca's MAPA.md** (1024×832 px at 1×), day/night light and per-room lights (CA-74, CA-43), rain on windows (CA-76), ≤30 fps cap (CA-06), pause when hidden (CA-07), very low CPU with the tab open all day (M-02 ≤5% of one core visible, M-03 ≤1% hidden), no GPU required (§5.7), graceful degradation (CA-81). HUD is regular DOM (React), drawn over the canvas.

Facts: pixi.js 8.23.0 (MIT, WebGL/WebGPU, ~80 MB unpacked package, tree-shakeable), phaser 4.2.1 (MIT, full game framework, ~112 MB unpacked). Pixel Agents uses Canvas 2D with `imageSmoothingEnabled=false`. Bundle size and CPU numbers for our scene are **inference until measured**.

Key observation: the whole world at 1× is only ~852 k pixels (64×52 tiles). Rendering at 1× into an offscreen canvas and doing **one** integer-scaled `drawImage` per frame keeps per-frame cost almost independent of zoom and screen size. Lighting at 1× (an overlay canvas composited with `multiply`, plus pre-baked pixel-style light sprites with `lighter`/`screen`) is cheap and stays pixel-crisp.

## Decision
Use a **custom Canvas 2D engine** (TypeScript, zero runtime dependencies) with:
1. **World buffer at 1×** (1024×832, `OffscreenCanvas` when available). Static layers (floor, walls, static furniture) baked once into a cached canvas; rebaked only when the map/decorations change (season, project rooms).
2. **Dynamic pass:** y-sorted sprites (NPCs, pets, animated furniture, front parts of furniture), in-world icons and speech bubbles (bubble text drawn with the pixel font at 1× or as DOM overlay — decided in the spike).
3. **Lighting pass at 1×:** ambient color by time of day (America/Sao_Paulo) on a light canvas; room lights and lamps add pre-baked light sprites; composited with `multiply`. Dark/lit project rooms = per-room light level.
4. **Present:** one `drawImage(world, …)` to the visible canvas with integer scale = `zoom × devicePixelRatio` rounded to an integer of device pixels, `imageSmoothingEnabled = false`; camera position snapped to whole art pixels.
5. **Frame scheduler:** `requestAnimationFrame` gated to ≤30 fps; **adaptive rate**: 30 fps while something moves (walking, camera pan, particles), ~10 fps when only ambient animations run; loop fully stopped on `visibilitychange: hidden`; `dt` clamped (≤100 ms) so nothing jumps on resume.
6. **Quality levels** (high/medium/low) that switch off rain, particles, light flicker and lower ambient fps when the frame budget is exceeded (CA-81).

### Spike S-02 (blocking for this ADR to become Accepted)
Prototype the same scene in Canvas 2D and PixiJS 8: 64×52 placeholder map, 20 sprites walking with A*, 4 lit rooms + night ambient, rain overlay, 1920×1080 viewport at zoom 3×, Edge on Carlos's PC.
Pass criteria (both measured for 10 min each):
| # | Criterion | Target |
|---|---|---|
| R1 | Browser CPU (renderer + GPU process), visible, NPCs mostly idle | ≤ 5 % of one core (M-02) |
| R2 | Same, worst case (all moving + rain + night) | ≤ 10 % and ≥ 24 fps |
| R3 | Hidden tab | 0 frames rendered; ≤ 1 % CPU (M-03) |
| R4 | Crispness | pixel test: screenshot at 3× has only colors from the palette (no interpolated colors) |
| R5 | FPS cap | never > 30 rendered frames/s over 60 s (CA-06) |
| R6 | Bundle (gzip) added by the renderer | report (Canvas ≈ 0; PixiJS measured) |
| R7 | Resume after hidden | ≤ 500 ms to first correct frame (CA-07) |
Decision rule: **Canvas 2D wins if it passes R1–R5 and R7.** If Canvas 2D fails R1/R2 and PixiJS passes with a margin ≥ 30 %, adopt PixiJS in a new ADR that supersedes this one. The engine API (`Renderer` interface in `src/web/engine/`) is kept backend-agnostic so the switch stays local.

## Alternatives considered
- **PixiJS 8** — WebGL batching, filters, blend modes; better if we had hundreds of sprites or shader lighting. Costs: dependency (~hundreds of kB min), WebGL context loss handling, GPU process wake-ups even at low fps. Kept as fallback, measured in the spike.
- **Phaser 4** — full game framework (scenes, physics, input, loader, its own loop and scale manager). Overlaps with React HUD and our own simulation; heaviest bundle; harder to keep the loop idle. Rejected.
- **DOM/CSS sprites** — hundreds of positioned elements; layout/compositing cost and pixel snapping issues at fractional DPR. Rejected.

## Consequences
- (+) Zero rendering dependency, small bundle, full control over the frame loop (key for all-day CPU budget), easy unit tests of pure parts (camera math, y-sort, light schedule).
- (+) Pixel-perfect by construction (1× buffer + integer scale).
- (−) We implement sprite atlas, y-sort, lighting and particles ourselves (bounded work; patterns exist in Pixel Agents).
- (−) Soft light gradients are not "shader quality"; acceptable and stylistically consistent with pixel art (pre-baked light sprites designed by Bianca).
- Risk: fractional Windows scaling (125 %/150 %) → handled by computing the integer scale in device pixels and sizing the canvas in device pixels; covered by an e2e screenshot test at DPR 1.25 and 1.5.
