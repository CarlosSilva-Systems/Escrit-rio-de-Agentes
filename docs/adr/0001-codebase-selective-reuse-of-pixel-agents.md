# ADR-0001: Codebase — new repository with selective, attributed reuse of Pixel Agents (MIT)

> **Resumo (pt-BR):** Em vez de um fork completo do Pixel Agents 1.6.0, criamos um repositório novo e **copiamos seletivamente** apenas trechos de código MIT úteis (com cabeçalho de atribuição e registro no `NOTICE.md`), usando o restante como referência. Nenhuma arte não-personagem do Pixel Agents é reutilizada. Isso **desvia da letra do pedido** ("partir de uma cópia") e precisa do OK do Carlos.

- Status: Accepted (2026-11-13, approved by the project owner)
- Date: 2026-11-12
- Deciders: Artur (architect); approval: Carlos

## Context
The request (PEDIDO §1) says: "start from a copy of Pixel Agents (MIT), keep license and credits". Research (PESQUISA §A) found:

- [F] Code is MIT, "Copyright (c) 2026 Pablo De Lucca". Any substantial copy must keep the copyright and permission notice.
- [F] **Non-character art (furniture, floors, walls, carpets, pets) has no documented license** (issue #355 open). Embedded font has conflicting licenses. → must not be reused.
- [F] The repo is an npm-workspaces monorepo (`core/`, `server/`, `adapters/vscode/`, `webview-ui/`). The server **auto-installs 12 hooks and a statusLine into `~/.claude/settings.json`** (forbidden by our F-06/CA-20 without diff + OK), uses a **fixed `~/.pixel-agents` directory** (collides with the running 3100 instance, which we must not touch until phase 5), sets **CORS `origin: true`**, accepts the token in the URL, accepts `--host 0.0.0.0`, and exposes a PTY terminal over WebSocket.
- [F] Known bugs: #333 (hook copy `dist/dist`), #413 (status logic). Bus factor ≈ 1. Tested on Node 22; Carlos runs **Node 26.13.1**.
- [F] Renderer: Canvas 2D, BFS 4-direction pathfinding (`tileMap.ts`), 16×32 character frames, no FPS cap and no explicit `visibilitychange` pause (relies on browser rAF throttling); layout designed around ~20×11 default, max 64×64.
- Our product differs in scope: 64×52 map (Bianca's MAPA.md), 16 fixed NPCs with routines, chat with PTY, approvals, kanban, usage meter, i18n, strict security. Most Pixel Agents modules would need to be rewritten or removed (VS Code adapter, hook installer, server registry, CORS, layout editor, art).

## Decision
1. Create a **new repository** (`escritorio-equipe`) with our own structure (see `docs/ARQUITETURA.md`).
2. **Selective reuse:** copy specific Pixel Agents source files only when they save real work (candidates, to be confirmed while implementing: hook payload types from `core/`, BFS/tile-map helpers, game-loop skeleton, JSONL transcript parsing helpers). Each copied or adapted file:
   - keeps a header: `// Portions derived from Pixel Agents (https://github.com/pixel-agents-hq/pixel-agents), Copyright (c) 2026 Pablo De Lucca, MIT License. Modified by <project>.`
   - is listed in `NOTICE.md` (en) / `NOTICE.pt-BR.md` with original path and upstream commit SHA.
3. Root `LICENSE`: MIT, with **both** copyright lines (Pablo De Lucca 2026 for derived portions; Carlos 2026 for the rest). The full upstream license text is also stored at `third_party/pixel-agents/LICENSE`.
4. **No art, fonts or sounds** from Pixel Agents are reused. Character art credit (JIK-A-4 "Metro City", CC0) is only mentioned if we actually use it.
5. Never copy: hook/statusLine auto-installer, `~/.pixel-agents` paths, server registry, CORS config, VS Code adapter, the embedded font.
6. The running Pixel Agents (3100), its files and `abrir-escritorio.bat` stay untouched until phase 5 (hash baseline task T-03).
7. A "Credits" screen in the UI lists Pixel Agents and every asset (CA-05, CA-82).

## Alternatives considered
- **A. Full fork / copy of the whole repo, then strip.** Keeps git history and a familiar starting point, satisfies the literal request. Rejected as default: we would delete or rewrite most of it (auto-install, registry, CORS, art, adapter, layout size), inherit known bugs and a Node 22 toolchain, and carry license-unclear art in history. Upstream merges would be impractical after the divergence anyway.
- **B. Reference only (zero copy).** Cleanest license story (no MIT notice needed), but wastes proven code (hook payload handling, tile helpers). Rejected: selective copy costs only a NOTICE entry.
- **C. Selective reuse (chosen).** Small, auditable surface; MIT obligations are simple and explicit.

## Consequences
- (+) No unlicensed asset in the repo or its history; no hidden side effects on `settings.json`; no collision with the 3100 instance.
- (+) We pick the stack versions (Node 26 LTS) and security model from day one.
- (−) Phase 1 is not "the copy running on 3200" but "our server running on 3200 with our map". Demo value is the same (office + NPCs + hooks), but this **deviates from the wording of the request → Carlos must approve**.
- (−) More initial code than a fork. Mitigated by small tasks and reuse of Pixel Agents logic where it helps.
- Risk: forgetting attribution on a copied file → `revisor-codigo` checks headers vs `NOTICE.md` at every phase gate.
