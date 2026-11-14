# Tarefas — Escritório da Equipe (projeto G)

> Autor: Artur (arquiteto) · 2026-11-12 · Base: `REQUISITOS.md` (CAs), `docs/ARQUITETURA.md`, ADRs 0001–0008.
> Formato compatível com o parser do painel (`docs/ARQUITETURA.md` §8): colunas por nome, `Responsável` = nome técnico do agente, status por emoji.
> Legenda: ⬜ a fazer · 🔄 em andamento · 🔍 em revisão · ✅ concluída · ⚠️ bloqueada · ❌ cancelada · `[paralelo]` pode rodar junto com as outras `[paralelo]` do mesmo bloco sem conflito de arquivo · Tamanho: S (≤2 h de agente) · M (≤meio dia) · L (dividir se passar de 1 dia).
> Regras: ninguém além da `git-github` commita; nada no `settings.json`, no Pixel Agents instalado ou no `abrir-escritorio.bat` fora das tarefas marcadas com **gate**; cada tarefa termina com `npm run check` verde (a partir da T-02).

## Gates do Carlos (pré-requisitos)
| Gate | O quê | Antes de |
|---|---|---|
| G0 | Aprovar PLANO.md + ADRs 0001–0008 (inclui o desvio "cópia seletiva" do ADR-0001) | T-01 |
| G1 | Aprovar lista de nomes/cargos (`PROPOSTA-NOMES.md`) — PA-01 | T-31 |
| G2 | Instalar o Claude Code CLI oficial (não está no PATH) — [C2] | S-01, S-03 |
| G3 | Preço/licença de assets pagos, se houver — CA-26 | T-23 |
| G4 | Diff do Nível 1 do settings.json (ADR-0004) | T-32 |
| G5 | Conclusão de cobrança confirmada + texto do aviso do modo Automático — CA-35 | fase 2 |
| G6 | Diff do Nível 2 (statusLine) — opcional | T-74 |
| G7 | OK de fim de fase + OK de push (cada fase) — CA-88 | fase seguinte |
| G8 | Troca final: diffs do `.bat`, atalho, inicialização e desativação dos hooks antigos | T-96…T-98 |

## Fase 0 — Preparação e spikes
Demonstrável: relatório dos spikes com números (CPU/fps, PTY no Node 26, payloads reais) e ADRs 0002/0003 aceitos ou substituídos.

| ID | Tarefa | Responsável | Depende de | Arquivos | CAs | Tam. | Validação | Status |
|---|---|---|---|---|---|---|---|---|
| T-01 | `git init`, `.gitignore` (node_modules, dist, .env, spikes/**/out), `.gitattributes` (`*.bat` CRLF, resto LF), branch `chore/fase-0` | git-github | G0 | `.gitignore`, `.gitattributes` | CA-88 | S | `git status` limpo após o commit inicial | ⬜ |
| T-02 | Esqueleto do repositório: `package.json` com pins exatos e scripts (§10), `.npmrc` (engine-strict), `.nvmrc`, tsconfigs, ESLint, Prettier, Vitest, Playwright (msedge), `.env.example`, pastas de `src/`, `LICENSE` (MIT duplo), `NOTICE*.md`, `third_party/pixel-agents/LICENSE`, `CREDITS*.md` vazios | dev-backend | T-01 | raiz do repo (configs), `src/**/.gitkeep`, `third_party/**` | CA-05, CA-25 | M | `npm ci && npm run check` verde com 1 teste de fumaça | ⬜ |
| T-03 | Linha de base de hashes (SHA-256) do Pixel Agents instalado, `~/.pixel-agents/hooks/*`, `abrir-escritorio.bat`, `iniciar-painel.bat` + script de verificação `[paralelo]` | testador-qa | T-02 | `scripts/verify-baseline.mjs`, `docs/projeto/2026-11-12-escritorio-equipe/baseline-hashes.json` | CA-04 | S | `node scripts/verify-baseline.mjs` → "idêntico" | ⬜ |
| S-01 | Spike PTY: `@lydell/node-pty` × `node-pty` no Node 26 + `claude --agent chefe --session-id` em ConPTY (cwd com espaço/acento), bracketed paste, latência e granularidade do transcript, resize, kill de árvore sem órfãos, diálogo de `--resume`, driver `-p` stream-json ponta a ponta `[paralelo]` | dev-backend | T-02, G2 | `spikes/pty/**`, `docs/projeto/2026-11-12-escritorio-equipe/spikes/S-01-pty.md` | CA-32, CA-33, CA-45 | M | relatório com números; pacote escolhido com versão exata | ⬜ |
| S-02 | Spike de renderização Canvas 2D × PixiJS 8 (cena 64×52 do MAPA.md, 20 sprites com A*, 4 salas iluminadas, noite, chuva, 1080p zoom 3×) medindo R1–R7 do ADR-0002 `[paralelo]` | dev-web | T-02 | `spikes/render/**`, `docs/projeto/2026-11-12-escritorio-equipe/spikes/S-02-render.md` | CA-06, CA-07, CA-08, CA-81 | M | planilha R1–R7 com medições no PC do Carlos | ⬜ |
| S-03 | Spike de hooks: sessão CLI com `--settings spikes/hooks/log-settings.json` registrando payloads reais (SubagentStart/Stop, Pre/PostToolUse incl. Agent/TaskCreate/ExitPlanMode, PermissionRequest esperando 20 s sem decisão, TaskCreated/Completed, Notification, UserPromptSubmit, Stop); confirma mesclagem de hooks via `--settings`, se o diálogo da TUI aparece durante a espera, e statusLine via `--settings` (interativo e `-p`). Fixtures anonimizadas `[paralelo]` | dev-backend | T-02, G2 | `spikes/hooks/**`, `tests/fixtures/hooks/**`, `docs/projeto/2026-11-12-escritorio-equipe/spikes/S-03-hooks.md` | CA-15, CA-18, CA-37, CA-41, CA-52, CA-58, CA-69 | M | fixtures validam contra o schema provisório; respostas às [?] da PESQUISA §C | ⬜ |
| S-05 | Spike JSONL: estrutura de `usage` e dedupe (`message.id`/`requestId`), `.meta.json` de subagentes, campo `cwd` — análise só de metadados; fixtures **sintéticas** com totais conhecidos `[paralelo]` | dev-backend | T-02 | `spikes/jsonl/**`, `tests/fixtures/jsonl/**` | CA-63, CA-64 | S | relatório da regra de dedupe + fixtures com totais | ⬜ |
| T-04 | Consolidar spikes: marcar ADR-0002/0003 como Accepted ou escrever ADR substituto; ajustar estas tarefas | arquiteto | S-01, S-02, S-03, S-05 | `docs/adr/**`, `TAREFAS.md` | — | S | ADRs atualizados, chefe ciente | ⬜ |
| T-05 | Guardar spikes em branches `spike/*` (fora do `main`) | git-github | T-04 | (git) | CA-88 | S | `main` sem `spikes/` | ⬜ |

Trilha de design (Bianca, em paralelo, fora desta tabela): GUIA-VISUAL, COMPONENTES, MAPA, PERSONAGENS, ASSETS e mockups em `docs/design/`.

## Fase 1 — Fundação
Demonstrável: `scripts/abrir-escritorio-dev.bat` abre `127.0.0.1:3200` (login por ticket); andar com todas as salas fixas e 4 vagas; 16 NPCs com nome/cargo/hover/painel; um agente chamado numa sessão do Desktop aparece trabalhando (Nível 0 via JSONL, ou Nível 1 se G4 aprovado); Freelancer; pt-BR/en; ≤30 fps e pausa em aba oculta.

| ID | Tarefa | Responsável | Depende de | Arquivos | CAs | Tam. | Validação | Status |
|---|---|---|---|---|---|---|---|---|
| T-10 | Contratos zod (hook payload, OfficeEvent, WS, REST, escritorio/v1, mapa/v1, uso/v1) + `schemas:gen` | dev-backend | T-04 | `src/shared/contracts/**`, `schemas/**` | CA-13, CA-25 | M | testes com fixtures válidas/inválidas | ⬜ |
| T-11 | Home `~/.escritorio-equipe`: tokens 256 bits + ACL (icacls), `config.json`, `runtime.json`, escrita atômica, logger pino com redação | dev-backend | T-10 | `src/server/home/**`, `src/server/config/**`, `src/server/log/**` | CA-03 | M | unit: token nunca no log; arquivo com ACL | ⬜ |
| T-12 | Servidor base: bind fixo 127.0.0.1, porta ocupada → erro claro, guarda de Host, cabeçalhos/CSP, estáticos, `/api/health`, encerramento limpo | dev-backend | T-11 | `src/server/main.ts`, `src/server/app.ts`, `src/server/http/guards/**`, `src/server/http/static.ts` | CA-01, CA-02 | M | integração: `netstat` só 127.0.0.1:3200; Host estranho → 403 | ⬜ |
| T-13 | Autenticação: `/api/auth/ticket`, `/auth/callback`, cookie `esc_sid`, `/api/session` (CSRF), rate limit, página 401 | dev-backend | T-12 | `src/server/http/auth/**` | CA-03, CA-30 | M | integração: sem/errado → 401; ticket reutilizado → 401 | ⬜ |
| T-14 | WS hub `/ws` (Origin/Host/cookie, batch 100 ms, snapshot na conexão) `[paralelo]` | dev-backend | T-13 | `src/server/ws/hub.ts` | CA-03, CA-30 | S | integração: WS sem Origin → 403 | ⬜ |
| T-15 | CLI `escritorio` (start/open/stop/status/token:rotate) + `scripts/dev.mjs` + `scripts/abrir-escritorio-dev.bat` `[paralelo]` | dev-backend | T-13 | `src/cli/**`, `scripts/dev.mjs`, `scripts/abrir-escritorio-dev.bat` | CA-83 (dev), CA-84 | M | rodar o `.bat` 2× → 1 processo; navegador logado | ⬜ |
| T-16 | Ingest: `/api/hooks/v1/claude` (hook-token, sem Origin), normalizador tolerante, dedupe, EventBus | dev-backend | T-14, S-03 | `src/server/ingest/**`, `src/shared/events/**` | CA-15, CA-16, CA-17 | M | integração com fixtures do S-03 | ⬜ |
| T-17 | `escritorio-hook.cjs` (observacional, ≤1 s, sai 0) + `hooks:sync` + gerador do `claude-settings.json` do painel `[paralelo]` | dev-backend | T-16 | `src/hook-runtime/escritorio-hook.cjs`, `src/server/settings-installer/sessionSettings.ts` | CA-15, CA-39 | M | unit: servidor desligado → sai em ≤1,5 s sem stdout | ⬜ |
| T-18 | Instalador do settings.json: `settings:diff/apply/revert` (Níveis 1/2), backup datado, mescla aditiva, marcador `.escritorio-equipe`, confirmação `APLICAR` | dev-backend | T-17 | `src/server/settings-installer/{diff,apply,revert}.ts` | CA-20, CA-59 | M | integração em cópia temporária: chaves existentes intactas; revert restaura byte a byte | ⬜ |
| T-19 | JsonlWatcher: tail incremental, eventos de reserva (Nível 0) para subagentes/ferramentas, `cwd` → projeto `[paralelo]` | dev-backend | T-16, S-05 | `src/server/jsonl/**` | CA-18, CA-44 | M | integração: arquivo de subagente novo → `subagent.start` em ≤2 s | ⬜ |
| T-20 | TeamRegistry: carrega/valida `escritorio.json` (+ cruzamento com mapa), último válido, reserva a partir do QUADRO.md, watch, regra do Freelancer `[paralelo]` | dev-backend | T-10 | `src/server/team/**` | CA-12, CA-13, CA-17 | M | unit: JSON inválido → diagnóstico com campo; QUADRO → 16 mínimos | ⬜ |
| T-21 | OfficeState: status lógico (refcount, chefe, freelancer, awaiting), atividade (ring 500), histórico por NPC, `/api/state`, `/api/npcs/:key/history`, `/api/diag` | dev-backend | T-16, T-20 | `src/server/office/**`, `src/server/http/routes/state.ts` | CA-15, CA-16, CA-17, CA-19 | M | unit: 2 Starts + 1 Stop = working; Stop final = idle | ⬜ |
| T-22 | Converter o MAPA.md da Bianca em `assets/map/mapa.json` (64×52; salas, portas, mesas `DIR-00…BIB-01` e vagas `-Vn`, `FL-D*`, fila `FILA-1…8`, POIs, janelas, zonas de luz, 4 salas de projeto) + teste de conectividade | designer-ux | T-10, MAPA.md | `assets/map/**`, `src/shared/world/mapValidation.test.ts` | CA-11 | M | `schemas` + BFS: tudo alcançável da recepção | ⬜ |
| T-23 | Assets da fase 1: tilesets/móveis/fontes OFL/sprites 16×32 dos 16 + Freelancer (placeholders aceitos), todos no CREDITS. **Produção de sprites únicos não tem dono na equipe → ver nota [C7]** | designer-ux | G3, ASSETS.md | `assets/tilesets/**`, `assets/sprites/**`, `assets/fonts/**`, `assets-private/` (fora do Git), `CREDITS*.md` | CA-05, CA-26, CA-42, CA-82 | L | `npm run credits:check` verde | ⬜ |
| T-24 | Web shell: Vite/React, store, rede (REST+CSRF, WS com reconexão), i18n (pt-BR/en + paridade), tela "abra pelo atalho" | dev-web | T-13, T-14 | `src/web/main.tsx`, `src/web/App.tsx`, `src/web/store/**`, `src/web/net/**`, `src/web/i18n/**` | CA-10 | M | unit paridade; e2e troca de idioma sem recarregar | ⬜ |
| T-25 | Motor: loop ≤30 fps adaptativo + pausa por visibilidade + `dt` limitado, renderer 1× com cache estático, câmera (escala inteira em pixels do dispositivo, pan, zoom no scroll, seguir), atlas, y-sort, picking | dev-web | S-02, T-24 | `src/web/engine/{loop,renderer,camera,atlas,picking}.ts`, `src/shared/world/camera.ts` | CA-06, CA-07, CA-80 | L | e2e: contador ≤30; aba oculta → 0 quadros; teste de nitidez DPR 1/1,25/1,5 | ⬜ |
| T-26 | Mundo: carregar `mapa.json`, camadas, A* (shared), luz fixa por sala, vagas de projeto apagadas | dev-web | T-22, T-25 | `src/web/engine/world/**`, `src/shared/world/{pathfinding,grid}.ts` | CA-11 | M | unit A*; e2e: todas as salas visíveis | ⬜ |
| T-27 | NPCs v1: FSM (AtDesk/Working/Celebrating/Awaiting básico/Freelancer chega-sai), status lógico → comportamento, animações básicas | dev-web | T-21, T-26 | `src/shared/npc/**`, `src/web/engine/npc/**` | CA-15, CA-16, CA-17 | L | unit FSM; e2e com hook simulado: NPC certo em ≤1 s | ⬜ |
| T-28a | HUD: barra superior (estúdio, relógio Brasília, agentes X/16, projetos ativos, som), infraestrutura de atalhos/Esc/foco, tela Créditos, overlay de debug `[paralelo]` | dev-web | T-24 | `src/web/hud/topbar/**`, `src/web/hud/credits/**`, `src/web/hud/keyboard.ts`, `src/web/hud/debug/**` | CA-05, CA-23, CA-80 | M | e2e: Tab alcança tudo; atalhos não disparam em campo de texto | ⬜ |
| T-28b | HUD: cartão de hover (≤150 ms, foco por teclado), painel de clique (≥10 atividades, tarefas atuais), minimapa, botão seguir, reduced-motion | dev-web | T-27, T-28a | `src/web/hud/npc/**`, `src/web/hud/minimap/**`, `src/web/engine/motion.ts` | CA-14, CA-19, CA-22, CA-80 | L | e2e com `reducedMotion: 'reduce'` | ⬜ |
| T-29 | Atualizar a skill `rh-equipe`: contratar/ajustar/desligar também edita `escritorio.json` (mesa livre do departamento, provisória na Recepção, frases), roda `team:check` | chefe | G1 | `C:\Users\carlo\.claude\skills\rh-equipe\SKILL.md` | CA-21 | S | revisão do Artur; simulação de contratação em cópia | ⬜ |
| T-30a | `team:check` (QUADRO.md × escritorio.json × mapa) e `team:init` (proposta aprovada → escritorio.json), diff de equipe → evento `team.diff` `[paralelo]` | dev-backend | T-20 | `src/cli/team/**`, `src/server/team/diff.ts` | CA-12, CA-21 | M | teste de consistência falha com agente faltando | ⬜ |
| T-30b | Cenas de boas-vindas (entra pela recepção, vai à mesa) e despedida | dev-web | T-27, T-30a | `src/web/engine/scenes/{welcome,farewell}.ts` | CA-21 | S | e2e: editar escritorio.json → cena sem recarregar | ⬜ |
| T-31 | **gate G1** Criar `~/.claude/equipe/escritorio.json` com `npm run team:init` a partir da proposta aprovada | chefe | T-30a, G1 | `C:\Users\carlo\.claude\equipe\escritorio.json` | CA-12 | S | `npm run team:check` verde | ⬜ |
| T-32 | **gate G4** Mostrar `npm run settings:diff -- --level 1`; com OK, aplicar; registrar no PLANO | chefe | T-18, G4 | `C:\Users\carlo\.claude\settings.json` (+ backup) | CA-18, CA-20 | S | sessão do Desktop chamando agente → NPC em ≤1 s | ⬜ |
| T-33 | QA fase 1: testes faltantes, matriz CA→teste, medições M-01…M-05 (`scripts/perf/measure-cpu.ps1`), verificação da linha de base | testador-qa | T-28b, T-30b | `tests/e2e/fase1/**`, `tests/integration/fase1/**`, `scripts/perf/**`, `docs/projeto/2026-11-12-escritorio-equipe/MATRIZ-CA.md` | CA-01…CA-25 | L | `npm run check` + relatório de medições | ⬜ |
| T-34 | Revisão de código fase 1 (inclui cabeçalhos de atribuição × NOTICE) `[paralelo]` | revisor-codigo | T-33 | relatório | CA-05, CA-25 | M | sem BLOQUEANTE | ⬜ |
| T-35 | Revisão de segurança fase 1: auth/ticket/cookie, rota de hooks, instalador do settings, SAST/SCA e licenças `[paralelo]` | revisor-seguranca | T-33 | relatório | CA-03, CA-20, CA-30 | M | sem CRÍTICO/ALTO | ⬜ |
| T-36 | Correções dos achados da fase 1 | dev-backend | T-34, T-35 | conforme achados | — | M | achados fechados | ⬜ |
| T-37 | Docs fase 1 (en + pt-BR): README, instalação, how-to "personalizar NPCs e escritorio.json", referência de config/variáveis/CLI, índice de ADRs, NOTICE/CREDITS revisados | documentador | T-36 | `README*.md`, `docs/en/**`, `docs/pt-BR/**` | CA-05, CA-87 | M | comandos testados; links sem quebra | ⬜ |
| T-38 | Explicação de arquitetura bilíngue (a partir deste ARQUITETURA.md) `[paralelo]` | documentador | T-36 | `docs/en/explanation/architecture.md`, `docs/pt-BR/explanation/architecture.md` | CA-87 | S | revisão do Artur | ⬜ |
| T-39 | Git fase 1: commits atômicos, CHANGELOG 0.1.0 (en/pt-BR), `PR-fase-1.md`; push só com G7 | git-github | T-37, T-38 | `CHANGELOG*.md`, `docs/projeto/2026-11-12-escritorio-equipe/PR-fase-1.md` | CA-88 | S | PR pronto; nada pendente no working tree | ⬜ |

## Fase 2 — Comando
Pré-requisitos: G5 (cobrança), S-01 aprovado, G2. Demonstrável: escolher/criar projeto, conversar com o Diretor pelo painel (modo interativo), ver a aba Terminal, aprovar/negar permissões pela caixa "Precisa de você" (com expiração), sala do projeto acende.

| ID | Tarefa | Responsável | Depende de | Arquivos | CAs | Tam. | Validação | Status |
|---|---|---|---|---|---|---|---|---|
| T-40 | ProjectCatalog + PathJail (realpath, junction, UNC, 8.3, reservados) + criar projeto + rotas | dev-backend | T-12 | `src/server/projects/{catalog,jail}.ts`, `src/shared/text/projectName.ts`, `src/server/http/routes/projects.ts` | CA-27, CA-28, CA-29, CA-44 | M | integração com `mklink /J` apontando para fora → 403 | ⬜ |
| T-41 | Resolução do `claude.exe` + SessionManager + PtyDriver (fila, bracketed paste, busy por hooks, diálogos conhecidos, kill de árvore, limite 4, PIDs) + `tests/fixtures/fake-claude.mjs` | dev-backend | S-01, T-21 | `src/server/sessions/{manager,ptyDriver,claudeBin}.ts`, `tests/fixtures/fake-claude.mjs` | CA-32, CA-45 | L | integração com fake-claude; sem órfãos após `stop` | ⬜ |
| T-46 | ApprovalBroker: criar/esperar/decidir (CAS), prazo, expirado, pós-prazo 409, mascaramento, detalhes sob demanda `[paralelo]` | dev-backend | T-16 | `src/server/approvals/**`, `src/shared/text/mask.ts` | CA-37, CA-38, CA-40, CA-41 | L | integração: duplo clique → 1 decisão | ⬜ |
| T-48 | Política das salas de projeto (4 vagas, mais recentes, "+N", libera após 10 min parado) `[paralelo]` | dev-backend | T-21 | `src/server/office/rooms.ts` | CA-43 | S | unit com relógio simulado | ⬜ |
| T-42 | Transcript → itens do chat (tail por sessão, markdown/ferramentas, cursor) | dev-backend | T-19, T-41 | `src/server/jsonl/transcript.ts` | CA-32, CA-36 | M | integração: 1º trecho ≤1 s após a escrita | ⬜ |
| T-43 | Histórico por projeto + retomar (`--resume`, id pertence ao projeto) | dev-backend | T-40, T-42 | `src/server/sessions/history.ts`, `src/server/http/routes/sessions.ts` | CA-36 | M | integração: id de outro projeto → erro claro | ⬜ |
| T-44 | PrintDriver (`-p` stream-json, opt-in por projeto, confirmação) `[paralelo]` | dev-backend | T-41 | `src/server/sessions/printDriver.ts` | CA-34 | M | integração com fake-claude em modo stream-json | ⬜ |
| T-45 | Canal `/ws/terminal/:id` (somente leitura, toggle de entrada com expiração, limites) `[paralelo]` | dev-backend | T-41 | `src/server/ws/terminal.ts` | CA-33 | S | integração: entrada sem toggle é descartada | ⬜ |
| T-47 | Hook PermissionRequest bloqueante (2 etapas, prazo, nunca allow em erro) + timeout 75 s no gerador/instalador | dev-backend | T-46, T-18 | `src/hook-runtime/escritorio-hook.cjs`, `src/server/settings-installer/**` | CA-38, CA-39 | M | unit: servidor travado → sai 0 sem stdout ≤ prazo+5 s | ⬜ |
| T-49 | UI seletor de projeto + "Novo projeto" (validação e mensagens) `[paralelo]` | dev-web | T-40 | `src/web/hud/chat/ProjectPicker.tsx`, `src/web/hud/chat/NewProjectDialog.tsx` | CA-27, CA-28 | M | e2e com nomes inválidos | ⬜ |
| T-52 | UI "Precisa de você": cartões, detalhes, contador vermelho, título "(n)", som, Notification API, "!" básico + NPC na porta da Diretoria `[paralelo]` | dev-web | T-46 | `src/web/hud/inbox/**`, `src/web/engine/npc/awaiting.ts` | CA-37, CA-40, CA-42, CA-71 | M | e2e ponta a ponta com hook simulado | ⬜ |
| T-53 | Render das salas de projeto (placa, quadro, barra no batente, acende/escurece) + gaveta de Projetos básica (centralizar) `[paralelo]` | dev-web | T-48, T-26 | `src/web/engine/world/projectRooms.ts`, `src/web/hud/projects/ProjectsDrawer.tsx` | CA-43, CA-80 | M | e2e: 5 projetos → 4 salas + "+1" | ⬜ |
| T-50 | UI chat: stream, markdown sanitizado (marked+DOMPurify), fila, indicador de modo, aviso do Automático, histórico/retomar | dev-web | T-42, T-43, T-44, T-49 | `src/web/hud/chat/{ChatPanel,Message,History,ModeSwitch}.tsx` | CA-32, CA-34, CA-36, CA-47 | L | e2e com fake-claude; XSS em nome de pasta não executa | ⬜ |
| T-51 | UI aba Terminal (xterm.js carregado sob demanda, toggle de entrada) `[paralelo]` | dev-web | T-45 | `src/web/hud/terminal/**` | CA-33 | S | e2e: somente leitura por padrão | ⬜ |
| T-55 | QA fase 2 + matriz + medição M-06 | testador-qa | T-50, T-51, T-52, T-53, T-47 | `tests/e2e/fase2/**`, `tests/integration/fase2/**`, `MATRIZ-CA.md` | CA-27…CA-47 | L | `npm run check`; 1 sessão real `@real` com OK | ⬜ |
| T-56 | Revisão de código fase 2 `[paralelo]` | revisor-codigo | T-55 | relatório | — | M | sem BLOQUEANTE | ⬜ |
| T-57 | Revisão de segurança fase 2 (spawn, jail, CSRF, WS, xterm, marked/DOMPurify, SCA) `[paralelo]` | revisor-seguranca | T-55 | relatório | CA-29…CA-31, CA-47 | M | sem CRÍTICO/ALTO | ⬜ |
| T-58 | Pentest fase 2 (lista do CA-46: sem token, CSRF, DNS rebinding, traversal/junction, injeção por nome/mensagem, WS sem Origin, XSS, replay de aprovação) `[paralelo]` | pentester | T-55 | relatório | CA-46 | M | sem CRÍTICO/ALTO | ⬜ |
| T-59 | Correções dos achados da fase 2 | dev-backend | T-56, T-57, T-58 | conforme achados | — | M | reteste do Pedro | ⬜ |
| T-60 | Docs fase 2 (en/pt-BR): how-to chat e retomar, modos e custo, aprovações, segurança, solução de problemas | documentador | T-59 | `docs/en/**`, `docs/pt-BR/**` | CA-87 | M | revisão | ⬜ |
| T-61 | Git fase 2: commits, CHANGELOG 0.2.0, `PR-fase-2.md`; push só com G7 | git-github | T-60 | `CHANGELOG*.md`, `docs/projeto/2026-11-12-escritorio-equipe/PR-fase-2.md` | CA-88 | S | PR pronto | ⬜ |

## Fase 3 — Acompanhamento
Demonstrável: salvar um PLANO.md e ver o kanban/progresso mudar em ≤2 s; barras 5h/7d com regressiva e alertas; gráfico de tokens por projeto/agente/dia; clicar na tarefa segue o NPC; confete ao concluir.

| ID | Tarefa | Responsável | Depende de | Arquivos | CAs | Tam. | Validação | Status |
|---|---|---|---|---|---|---|---|---|
| T-62 | Parser de PLANO.md/TAREFAS.md (contrato §8) + fixtures (válidas, malformadas, parciais) `[paralelo]` | dev-backend | T-10 | `src/shared/plan/**`, `tests/fixtures/plano/**` | CA-49, CA-50, CA-51, CA-53 | M | unit com este próprio TAREFAS.md como fixture | ⬜ |
| T-65 | `escritorio-statusline.cjs` (linha útil, `uso.json` atômico, `--wrap`) + inclusão no `claude-settings.json` do painel `[paralelo]` | dev-backend | T-17 | `src/hook-runtime/escritorio-statusline.cjs`, `src/server/settings-installer/sessionSettings.ts` | CA-58, CA-59 | M | unit: ≤200 ms; sem rate_limits não sobrescreve | ⬜ |
| T-67 | TokenAggregator (incremental, dedupe, atribuição por agente/projeto/dia Brasília, cache) + `/api/tokens` + teste de privacidade `[paralelo]` | dev-backend | S-05, T-19 | `src/server/tokens/**` | CA-63, CA-64 | L | fixtures com totais exatos; cache sem texto | ⬜ |
| T-68 | GitInfo (branches/commits do projeto ativo, `execFile` somente leitura) `[paralelo]` | dev-backend | T-40 | `src/server/projects/gitInfo.ts` | US-41 | S | integração em repo temporário | ⬜ |
| T-63 | PlanWatcher + projeto ativo/fase/concluído + `/api/projects/:name/plan` + `plan.update` | dev-backend | T-62, T-40 | `src/server/projects/planWatcher.ts`, `src/server/http/routes/plan.ts` | CA-48, CA-49, CA-52 | M | integração: salvar → WS em ≤2 s | ⬜ |
| T-64 | Sobreposição ao vivo (Subagent/Task → "trabalhando agora", faixa "Tarefas da sessão") | dev-backend | T-63 | `src/server/office/taskOverlay.ts` | CA-52 | S | integração com fixtures do S-03 | ⬜ |
| T-66 | UsageWatcher + alertas 80/95 (uma vez por ciclo, histerese) + `/api/usage` | dev-backend | T-65 | `src/server/usage/**`, `src/shared/usage/**` | CA-56, CA-57, CA-60, CA-61, CA-62 | M | unit: 79↔80 não repete | ⬜ |
| T-69 | UI gaveta Projetos (%/fase/tamanho) + painel inferior kanban (5 colunas, rostos, selos) + checklist/DoD + linha do tempo | dev-web | T-63 | `src/web/hud/projects/**`, `src/web/hud/kanban/**` | CA-48…CA-53, CA-80 | L | e2e: fixture → colunas corretas | ⬜ |
| T-70 | UI medidor 5h/7d na barra superior (cores, piscar respeitando reduced-motion, regressiva, "atualizado há X", banners) `[paralelo]` | dev-web | T-66 | `src/web/hud/usage/**` | CA-56, CA-57, CA-60, CA-61, CA-62 | M | e2e com uso.json de fixtures | ⬜ |
| T-71 | UI tokens (barras SVG sem biblioteca) + "tokens hoje" no painel do NPC `[paralelo]` | dev-web | T-67 | `src/web/hud/tokens/**`, `src/web/hud/npc/NpcTokens.tsx` | CA-63, CA-19 | M | e2e: soma igual à fixture | ⬜ |
| T-72 | Clique na tarefa → destaca e segue o NPC; comemoração única de projeto concluído (persistida) | dev-web | T-69 | `src/web/hud/kanban/TaskFollow.ts`, `src/web/engine/scenes/celebration.ts` | CA-54, CA-55 | M | e2e: recarregar não repete | ⬜ |
| T-73 | Quadros vivos no mundo: Metas do mês, Bugs encontrados ([C8]), árvore de branches, TV com kanban, painel de projetos ativos | dev-web | T-68, T-69 | `src/web/engine/boards/**` | US-41 | M | e2e/screenshot | ⬜ |
| T-74 | **gate G6** (opcional) S-04 statusLine no Desktop (2 min, com backup) e Nível 2 do settings.json | chefe | T-65, G6 | `C:\Users\carlo\.claude\settings.json` (+ backup) | CA-59, CA-61 | S | `uso.json` atualiza em sessão CLI externa | ⬜ |
| T-75 | QA fase 3 | testador-qa | T-69…T-73 | `tests/e2e/fase3/**`, `tests/integration/fase3/**`, `MATRIZ-CA.md` | CA-48…CA-64 | L | `npm run check` | ⬜ |
| T-76 | Revisão de código fase 3 `[paralelo]` | revisor-codigo | T-75 | relatório | — | M | sem BLOQUEANTE | ⬜ |
| T-77 | Revisão de segurança fase 3 (privacidade do JSONL, statusline, GitInfo, instalador Nível 2) `[paralelo]` | revisor-seguranca | T-75 | relatório | CA-59, CA-64 | M | sem CRÍTICO/ALTO | ⬜ |
| T-78 | Correções dos achados da fase 3 | dev-backend | T-76, T-77 | conforme achados | — | M | — | ⬜ |
| T-78d | Docs fase 3 (en/pt-BR): medidor, tokens, como o painel lê o PLANO.md, Nível 2 da statusLine | documentador | T-78 | `docs/en/**`, `docs/pt-BR/**` | CA-87 | M | revisão | ⬜ |
| T-79 | Git fase 3: CHANGELOG 0.3.0, `PR-fase-3.md`; push só com G7 | git-github | T-78d | `CHANGELOG*.md`, `docs/projeto/2026-11-12-escritorio-equipe/PR-fase-3.md` | CA-88 | S | PR pronto | ⬜ |

## Fase 4 — Vida
Demonstrável: escritório "vivo" por 30 min sem sincronia, conversas e fofocas reais, mascotes, dia/noite e chuva, sazonal simulável, sons opcionais, Modo TV e celular — dentro do orçamento de CPU.

| ID | Tarefa | Responsável | Depende de | Arquivos | CAs | Tam. | Validação | Status |
|---|---|---|---|---|---|---|---|---|
| T-80 | Agendador de rotina + anti-sincronia (≤40 %, capacidade de POI, cooldown, pesos de personalidade/horário), banheiro, cochilo `[paralelo]` | dev-web | T-27 | `src/shared/npc/routine/**` | CA-65 | L | simulação de 30 min com semente | ⬜ |
| T-81 | Animações por ferramenta + ícones ⚙ ☕ 💤 ! com precedência e texto equivalente `[paralelo]` | dev-web | T-27 | `src/web/engine/npc/anim/**`, `src/web/engine/npc/statusIcon.ts` | CA-69, CA-72 | M | unit mapeamento; e2e | ⬜ |
| T-84 | Fatos para fofocas (últimas 24 h, só metadados) via WS `[paralelo]` | dev-backend | T-21 | `src/server/office/gossip.ts` | CA-67 | M | unit: fato verdadeiro com fixtures | ⬜ |
| T-86 | Dia/noite Brasília, luminárias, cordão do terraço, chuva, níveis de qualidade/degradação `[paralelo]` | dev-web | T-26 | `src/web/engine/lighting/**`, `src/web/engine/weather/**`, `src/shared/world/daycycle.ts` | CA-74, CA-76, CA-81 | L | `?debugTime`; medição CPU no pior caso | ⬜ |
| T-82 | Delegação ("<Apelido>, preciso de você!", fila de balões), espera completa na porta da Diretoria, lugar de trabalho `auto` | dev-web | T-80, T-83 | `src/shared/npc/scenes/delegation.ts` | CA-70, CA-71 | M | e2e com eventos simulados | ⬜ |
| T-83 | Balões e conversas (máquina de escrever, fila, sem repetição, 4–8 s) + `assets/phrases/eventos.pt-BR.json` | dev-web | T-80 | `src/web/engine/bubbles/**`, `src/shared/npc/talk/**`, `assets/phrases/**` | CA-66, CA-67 | M | unit; reduced-motion = texto inteiro | ⬜ |
| T-85 | Mascotes (passear, seguir, dormir perto de parado, corações; nunca bloqueiam clique) | dev-web | T-80 | `src/web/engine/pets/**` | CA-73 | M | e2e clique no NPC sob o mascote | ⬜ |
| T-87 | Sazonais + aniversário de projeto (PA-17) | dev-web | T-86, T-68 | `src/shared/world/seasons.ts`, `src/web/engine/decor/**` | CA-75 | M | `?debugDate` | ⬜ |
| T-88 | Sons e música (mudos por padrão, faixas livres no CREDITS, volume persistido) `[paralelo]` | dev-web | T-24 | `src/web/audio/**`, `assets/sfx/**`, `assets/music/**` | CA-77 | M | e2e: nada toca sem ação | ⬜ |
| T-89 | Modo TV + layout celular 390×844 `[paralelo]` | dev-web | T-69, T-70 | `src/web/hud/layout/**` | CA-78, CA-79 | M | e2e de viewport | ⬜ |
| T-90 | (Could) Falas por IA — **recomendo não fazer nesta entrega** (custo, F-02); se o Carlos quiser, novo ADR | dev-backend | decisão do Carlos | — | CA-68 | M | — | ❌ |
| T-91 | QA fase 4 + medição de CPU no pior caso (CA-81) | testador-qa | T-80…T-89 | `tests/e2e/fase4/**`, `MATRIZ-CA.md` | CA-65…CA-81 | L | relatório de medições | ⬜ |
| T-92 | Revisão de código fase 4 `[paralelo]` | revisor-codigo | T-91 | relatório | — | M | sem BLOQUEANTE | ⬜ |
| T-93 | Revisão de segurança fase 4 (fofocas sem conteúdo, Modo TV sem dados sensíveis, licenças de áudio) `[paralelo]` | revisor-seguranca | T-91 | relatório | CA-67, CA-78 | S | sem CRÍTICO/ALTO | ⬜ |
| T-94a | Correções dos achados da fase 4 | dev-web | T-92, T-93 | conforme achados | — | M | achados fechados | ⬜ |
| T-94 | Docs fase 4 (en/pt-BR): how-to personalizar salas, falas, mascotes, sazonais | documentador | T-94a | `docs/en/**`, `docs/pt-BR/**` | CA-87 | M | revisão | ⬜ |
| T-95 | Git fase 4: CHANGELOG 0.4.0, `PR-fase-4.md` | git-github | T-94 | `CHANGELOG*.md`, `docs/projeto/2026-11-12-escritorio-equipe/PR-fase-4.md` | CA-88 | S | PR pronto | ⬜ |

## Fase 5 — Troca
Demonstrável: reiniciar o PC → o novo escritório sobe e abre pelo atalho "Escritório dos Agentes"; rollback testado; documentação final.

| ID | Tarefa | Responsável | Depende de | Arquivos | CAs | Tam. | Validação | Status |
|---|---|---|---|---|---|---|---|---|
| T-96 | **gate G8** Novo `abrir-escritorio.bat` (mesma lógica: liga se desligado, senão abre; sem token na URL), backup datado do antigo, script de rollback testado | dev-backend | G7 (fase 4), G8 | `C:\Users\carlo\pixel-agents\abrir-escritorio.bat` (+ backup), `scripts/windows/{abrir-escritorio,rollback}.*` | CA-83, CA-85 | M | rodar 2×: 1 processo; rollback restaura hashes da T-03 | ⬜ |
| T-97 | **gate G8** Inicialização do Windows + atalho "Escritório dos Agentes" (backup dos antigos) | dev-backend | T-96 | atalho, pasta Startup (backups em `~/.escritorio-equipe/backup/`) | CA-84, CA-85 | S | reiniciar e logar | ⬜ |
| T-98 | **gate G8** Diff para remover hooks/statusline do Pixel Agents do settings.json e parar o autoinício dele (sem desinstalar) | dev-backend | T-96, G8 | `C:\Users\carlo\.claude\settings.json` (+ backup) | CA-86 | S | nenhum evento duplicado; 3100 não sobe sozinho | ⬜ |
| T-99 | Pentest de regressão + revisão de segurança final `[paralelo]` | pentester | T-98 | relatório | CA-46, CA-86 | M | sem CRÍTICO/ALTO | ⬜ |
| T-99b | Revisão de segurança final (SCA completo) `[paralelo]` | revisor-seguranca | T-98 | relatório | CA-46 | S | sem CRÍTICO/ALTO | ⬜ |
| T-100 | Guia de instalação testado em Windows 11 limpo (usuário novo/VM) + docs finais completas (en/pt-BR) | documentador | T-98 | `docs/en/**`, `docs/pt-BR/**`, `README*.md` | CA-87 | M | Teresa segue só o guia e chega ao escritório | ⬜ |
| T-101 | QA final: `npm run check` no Windows, matriz sem CA Must descoberto, verificação de hashes (CA-04 até a troca) | testador-qa | T-99, T-100 | `MATRIZ-CA.md` | CA-89 | M | relatório | ⬜ |
| T-102 | Git final: CHANGELOG 1.0.0, `PR-fase-5.md`; push/merge só com OK | git-github | T-101 | `CHANGELOG*.md`, `docs/projeto/2026-11-12-escritorio-equipe/PR-fase-5.md` | CA-88 | S | PR pronto | ⬜ |

## Lacunas de dono e sugestões de contratação
- **[C7] Produção de pixel art (16 personagens únicos 16×32 com ~10 animações × 4 direções, mascotes, móveis temáticos):** a matriz não tem dono para *produzir* sprites — a Bianca (designer-ux) define guia, paleta e escolhe pacotes. Opções: (a) a Bianca assume a produção usando pacotes CC0/pagos + recolorização/composição (risco de prazo); (b) **contratar** via `rh-equipe` um agente `design-pixelart` ("Pixel Artist", sonnet, escreve só em `assets/**`). Recomendo (b) se os pacotes escolhidos não trouxerem personagens modulares.
- Integração Windows (atalho, Startup, `.bat`) fica com `dev-backend` (scripts Node/batch) — não há encaixe real para `dev-automacao`/`dev-embarcados` neste projeto.
- `chefe` executa os gates que tocam arquivos do Carlos (T-29, T-31, T-32, T-74), sempre depois do OK dele.
