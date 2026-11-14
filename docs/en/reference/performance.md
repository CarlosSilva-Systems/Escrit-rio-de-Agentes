# Reference: measured performance

[🇧🇷 Português](../../pt-BR/reference/performance.md) · [Documentation index](../README.md)

Numbers from the final Phase 1 QA round (report `docs/projeto/2026-11-12-escritorio-equipe/QA-FASE-1.md`, in Portuguese). Setup: Edge 157 headless with a real GPU, 60-second windows, 1920×1080 at device pixel ratio 1, test server on a random loopback port and a temporary home. CPU is the percentage of **one** core, summed over every browser process.

## Browser CPU and frame rate

| Scenario | CPU | fps | Target | Result |
|---|---|---|---|---|
| Idle, tab visible (16 NPCs) | 3.25 % | 5.7 | ≤ 5 % | met |
| Idle, tab hidden | 0.31 % | 0 | ≤ 1 % | met |
| 5 NPCs working (a hook event every second) | 4.15 % | 5.4 | ≤ 5 % | met |
| 2 NPCs walking | 10.46 % | 18 | informative | — |
| 5 NPCs walking | 15.36 % | 26.3 | worst case ≤ 10 % | above target |
| Worst case: 20 walking + rain + night | 17.32 % | 26.4 | ≤ 10 % | **above target** (known deviation, to be handled in Phase 4; the spike measured 14.5 %) |
| 5 working, tab hidden | 0.51 % | 0 | ≤ 1 % | met |
| Worst case, tab hidden | 0.25 % | 0 | ≤ 1 % | met |

The cost follows the frame rate (about 6 fps ≈ 3–4 %, 20 fps ≈ 10 %, 30 fps ≈ 15–17 %), not the number of NPCs. No scenario exceeded 30 frames in any one second (maximum observed: 28).

## Latency, server and size

| Metric | Measured | Target | Result |
|---|---|---|---|
| Hook to "working" NPC, 50 samples | p50 140 ms, **p95 142 ms**, max 144 ms | p95 ≤ 1 s, max ≤ 2 s | met |
| Idle server CPU (59 s, one browser) | 0.11 % | ≤ 2 % | met |
| Server memory | 93.0 → 79.6 MB working set over 59 s | < 50 MB over 8 h | no leak signal; 8 h not measured |
| Cold start to first HTTP answer (5 runs) | median 950 ms (931–1206) | informative | — |
| Web bundle, gzip | JS 143.3 kB + CSS 3.3 kB = 154.3 kB | ≤ 400 kB | met |
| Page memory, 180 s with 16 working NPCs and visitors | heap 5.2 → 6.8 MB, steady DOM nodes and listeners | stable | met |
| Contrast (WCAG) | 73 colour pairs, 0 failing | ≥ 4.5:1 text, ≥ 3:1 UI | met |

Not measured: a 10-minute CPU run, Edge with a visible window, a real hidden tab, a server running 8 hours.

## Reproduce

```
npm run perf:fase1            # 60-second run on temporary homes and ports
node scripts/perf/measure-fase1.mjs --seconds 600
npm run qa:contrast
```

It never touches the real server on port 3200 or `~/.claude`. Results go to `test-results/perf-fase1.json` (use `--out` to keep them; Playwright clears that folder).

## Related

- [Known limitations](../explanation/limitations.md)
- [Why Canvas 2D](../explanation/why-canvas-2d.md)
