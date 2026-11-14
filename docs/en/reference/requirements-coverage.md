# Reference: requirements coverage (Phase 1)

[🇧🇷 Português](../../pt-BR/reference/requirements-coverage.md) · [Documentation index](../README.md)

Phase 1 is covered by acceptance criteria CA-01 to CA-25. The authoritative, test-by-test matrix is [`MATRIZ-CA.md`](../../projeto/2026-11-12-escritorio-equipe/MATRIZ-CA.md) (Portuguese); the QA findings and measurements are in [`QA-FASE-1.md`](../../projeto/2026-11-12-escritorio-equipe/QA-FASE-1.md); the requirements themselves are in [`REQUISITOS.md`](../../projeto/2026-11-12-escritorio-equipe/REQUISITOS.md). Tests name the criterion they cover (`it('CA-16: …')`), so `grep -rn "CA-16" src tests` finds them.

## Summary by criterion

"Automated" means a unit, integration or end-to-end test passes. "Manual part" is something only you can do or only a long run can measure.

| CA | Topic | Status |
|---|---|---|
| 01 | Listens only on `127.0.0.1:3200` | Automated |
| 02 | Busy port is a clear error, never another port | Automated |
| 03 | Token required, 256 bits, constant-time, never logged | Automated (token rotation closes sockets within about a second; see note) |
| 04 | Installed Pixel Agents untouched (hash baseline) | Automated (`npm run verify:baseline`) |
| 05 | MIT license, NOTICE and CREDITS in both languages, Credits screen | Automated (`npm run credits:check` exists now) |
| 06 | At most 30 frames per second | Automated |
| 07 | Hidden tab draws nothing, no teleporting on return | Automated |
| 08 | CPU: visible ≤ 5 %, hidden ≤ 1 %, server ≤ 2 % | 60 s measured; 10 min run is the manual part. Worst case above target, see [Performance](performance.md) |
| 09 | No `claude -p`, SDK or paid API; no outside network | Automated (static and runtime checks) |
| 10 | pt-BR default, English without reload, same keys | Automated |
| 11 | Every fixed room present, department colours | Automated |
| 12 | Exactly 16 NPCs with correct names and titles | Automated; approval of the name list (gate G1) is yours |
| 13 | Missing or invalid `escritorio.json` gives a warning and keeps the last valid | Automated, including the on-screen warning |
| 14 | Hover card within 150 ms | Automated |
| 15 | Agent call makes the NPC work in under 1 s | Automated (p95 142 ms) |
| 16 | Stop celebrates; two starts and one stop still working | Automated |
| 17 | Unknown type becomes a Freelancer, replaced when added to the team | Automated |
| 18 | NPCs show for Claude Desktop sessions; notice when not detected | Fallback automated; the real Desktop session is the manual part (gate G4) |
| 19 | Click opens the panel (10+ activities); Esc or click outside closes | Automated |
| 20 | Settings diff first, approval, backup, additive merge, reversible | Automated on temporary copies; applying to the real file is the manual part (gate G4) |
| 21 | `rh-equipe` keeps `escritorio.json` in sync; welcome and farewell scenes | Scenes and `team:check` automated; the skill update is pending (outside the repository) |
| 22 | `prefers-reduced-motion` | Automated |
| 23 | Shortcuts C/T/A/M, Tab with visible focus, Esc | Automated |
| 24 | Contrast ≥ 4.5:1 text and ≥ 3:1 UI; colour never the only signal | Automated (`npm run qa:contrast`) |
| 25 | Tests for state machine, event to NPC, contracts, routes | Automated (reading `PLANO.md` is Phase 3) |

Also exercised in Phase 1: CA-30 (Origin, Host, CSRF, WebSocket), CA-39 (the hook never blocks), CA-44 (project from the working folder), CA-59 (status line in the diff), CA-64 (privacy), CA-71 (permission request sends the NPC to the Director's door).

## Final result of the Phase 1 QA

Of CA-01 to CA-25: **22 covered and passing** (for CA-08 only the automatable part), **3 partial with a manual remainder** (CA-18, CA-20, CA-21) and **0 without coverage**. Latest full run: `npm run check` green with 474 unit and 205 integration tests, and 83 end-to-end tests green, with no test left marked "expected failure". All bugs of the QA round are fixed.

Manual items still pending: a real Claude Desktop session, applying the `settings.json` diff, the `rh-equipe` skill update, a 10-minute CPU run and a server running 8 hours. The worst-case CPU deviation (about 17 % against 10 %) is known and scheduled for Phase 4, see [Performance](performance.md).

## Related

- [Known limitations](../explanation/limitations.md)
- [Measured performance](performance.md)
