# QA da Fase 1 — relatório FINAL (T-33)

> Autora: Teresa (QA) · Base: `MATRIZ-CA.md`. Rodada final contra o working tree com backend e front estáveis, servidor real **parado** (`node dist/cli.js status` → "O Escritório não está ligado"), sem git. Os "commits" citados são os que contêm o código corrigido no histórico atual.

## 1. Veredito

**PRONTO PARA APRESENTAR, com 2 ressalvas menores e itens manuais.** Nenhum bug aberto de severidade Alta ou Média. Servidor firme sob abuso, console limpo, contraste 100 %, CPU e latência dentro das metas (exceto o desvio conhecido do pior caso de renderização, R2).

Ressalvas: (1) OBS-01 — um `404` no console a cada carga (provavelmente `/favicon.ico`; `index.html` não tem `<link rel="icon">`); (2) o pior caso de renderização (≥ 4 NPCs andando) custa ~15–17 % de um núcleo contra a meta de 10 % (desvio R2 já conhecido, não corrigido de propósito). Manuais que dependem do Carlos: sessão real do Desktop (T-32, gate G4), skill `rh-equipe` (T-29), CPU de 10 min.

## 2. Números da rodada final

| Comando | Resultado real |
|---|---|
| `npm run check` | verde: lint + prettier + typecheck + `credits:check` + **474 unitários** (40 arquivos) + **205 integração** (17 arquivos) |
| `QA_MEM_SECONDS=30 npx playwright test` | **83 passaram**, 0 falhas, 0 falhas esperadas (1,2 min) |
| `node scripts/check-contrast.mjs` | 73 pares: 0 reprovam, 0 divergem > 0,05; 14 regras de `app.css` ok; `tokens.css` sincronizados |
| `node scripts/verify-baseline.mjs` | **idêntico** |
| `node scripts/perf/measure-fase1.mjs --seconds 60` | tabela do §5 |

Testes novos da rodada final: `tests/e2e/fase1/final.spec.ts` (7) e `tests/integration/fase1/session-limits.test.ts` (7).

## 3. Bugs, regressões, lacunas: estado FINAL

Todos os testes que antes eram "falha esperada" (`test.fail`/`it.fails`) agora são testes normais **e passam**: foram a prova das correções.

| ID | Sev. | CA | Problema | Estado | Onde foi corrigido | Teste que prova |
|---|---|---|---|---|---|---|
| BUG-01 | Alta | 13 | sem aviso visual quando `escritorio.json` é inválido | **CORRIGIDO** | `8073bc5` (`src/web/hud/DiagnosticsBanner.tsx`, `diagnostics.ts`), `aa17d71` (código/params no `Diagnostic`) | `content.spec.ts :: CA-13: BUG-01 the panel must show a warning naming the file and the field…`; novo `final.spec.ts :: CA-13: the diagnostics banner follows escritorio.json live…` (ausente → nota; válido → nada; lixo × 4 → aviso com "escritorio.json"; campo `agents`; dispensar; valor hostil como texto) |
| BUG-02 | Média | 19 | painel do NPC não fecha clicando fora | **CORRIGIDO** | `901f1f8` (`src/web/hud/npc/NpcPanel.tsx`) | `content.spec.ts :: CA-19: BUG-02 clicking outside the NPC panel…` |
| BUG-03 | Baixa | 14 | palavra longa estoura a gaveta da Equipe | **CORRIGIDO** | `2f857b1` (`src/web/styles/app.css:543`, `overflow-wrap: anywhere`) | `content.spec.ts :: CA-14: BUG-03 an unbroken 60-character title…` |
| BUG-04 | Baixa | 3 | `token:rotate` só derrubava sockets na próxima requisição HTTP | **CORRIGIDO** | `7e82b0c` (`src/server/app.ts:165`, `rotationWatch` a cada 1 s com clientes) | `adversarial.test.ts :: CA-03: BUG-04 token:rotate must close open WebSockets by itself…`; `resilience.spec.ts :: CA-03: token rotation while the page is open…` |
| BUG-05 | Baixa | 14/23 | `npcs.spec.ts :: CA-14: the team list reaches every NPC by keyboard…` falhava (cascata de Esc) | **CORRIGIDO** (teste volta a passar; sem mudança de comportamento exigida) | commit exato não identificado (provável `901f1f8`) | o próprio teste, verde nas duas últimas rodadas |
| REG-01 | Média | 13 | `writeFileAtomic` com ENOENT em pasta ainda inexistente | **CORRIGIDO** | `5d77c5f` (um único escritor atômico) | `tests/integration/team.test.ts :: CA-13: a watcher on a not-yet-existing directory attaches when it is created` |
| REG-02 | Baixa | 3 | cookie sem `Max-Age=604800` (a janela mudou) | **CORRIGIDO / teste atualizado**: a regra agora é 8 h ociosas e 24 h absolutas | `b9621f4` / `7e82b0c` (`src/server/http/auth/sessions.ts`; commit exato não verificado) | novo `session-limits.test.ts :: CA-03: the cookie is HttpOnly, SameSite=Strict, Path=/ and lives at most 8 h`; `auth.test.ts :: CA-03: ticket -> cookie…` |
| GAP-01 | Baixa | 5 | faltava `npm run credits:check` | **CORRIGIDO** | `a6ce5e2` (`scripts/check-credits.mjs`, no `npm run check`) | roda dentro do `check` (verde); `compliance.test.ts :: CA-05: …` |
| GAP-02 | Média | 18 | aviso "sessões do Desktop não detectadas" inexistente | **CORRIGIDO** (aviso discreto e dispensável; a sessão real segue manual) | `901f1f8` (`desktopHint.ts`), `8073bc5` (`DiagnosticsBanner.tsx`) | `src/web/hud/desktopHint.test.ts`; `final.spec.ts :: CA-18: the Desktop-sessions hint is quiet…` (aparece como nota informativa, nunca como aviso) |
| OBS-01 | Baixa | — | 1 erro de console "Failed to load resource 404" a cada carga | **ABERTO** | — | `final.spec.ts :: console: a full tour…` tolera só esse 404 (e falha em qualquer outro). Provável `/favicon.ico` (a página não declara ícone; `/favicon.ico` e `/assets/sprites/manifest.json` dão 404). Sugestão: `<link rel="icon" href="data:,">` |
| OBS-02 | Baixa | 17 | sem teto de Freelancers | **CORRIGIDO** | `d7a7363` (`MAX_FREELANCERS = 12`, excedente contado em `office.droppedFreelancers`) | `adversarial.test.ts :: CA-15: 300 distinct unknown agent types… are capped at 12 Freelancers`; `viewport.spec.ts :: CA-06: 60 simultaneous Freelancers…` |
| OBS-03 | — | 17 | mapa só desenha ~15 visitantes | **SUPERADO** pelo teto de 12 (todos cabem) | `d7a7363` | idem |
| OBS-04 | — | 23 | 3 Esc para fechar a gaveta com foco numa linha | **MANTIDO (desenho)** | — | `content.spec.ts :: CA-23: Tab / Shift+Tab… Esc unwinds panel -> drawer` |
| OBS-05 | — | 24 | `.btn:disabled` dá 2,97:1 sobre `bg-700` | **MANTIDO (isento pela WCAG: componente inativo)** | — | `contrast.test.ts` marca `text-disabled` como isento |

**Bugs novos na rodada final: nenhum** (além do OBS-01, já conhecido).

## 4. Caça final aos fluxos novos

| Fluxo | Resultado | Teste |
|---|---|---|
| Logout pelo menu (confirmação, Esc cancela) → tela "abra pelo atalho"; cookie removido; outra aba do mesmo navegador cai na mesma tela; hub com 0 clientes; cookie antigo repetido à mão = 401; `POST /api/auth/logout` repetido não dá 5xx | OK | `final.spec.ts` (1º), `session-limits.test.ts` |
| Reabrir por ticket: entra, URL limpa (sem ticket), o mesmo ticket 2× = 401 | OK | `final.spec.ts` (1º) |
| Logout com o servidor parado | descarta a sessão local e mostra a tela do atalho | `final.spec.ts` (2º) |
| `POST /api/auth/logout` sem CSRF → ≥ 400; Origin estranho → 403 | OK | `session-limits.test.ts` |
| Idioma + som por `PATCH /api/config` com **duas abas** simultâneas | os dois campos sobrevivem (`lang=en`, `sound=true`); cada PATCH leva CSRF e volta 200; navegador novo (sem escolha local) abre no idioma salvo no servidor | `final.spec.ts` (3º) |
| `PATCH /api/config` com idioma inválido, campo desconhecido, nome de projeto com `..`, sem CSRF, Origin estranho | 400 / 400 / 400 / ≥ 400 / 403; nada muda | `final.spec.ts` (4º) |
| Banner de diagnóstico em tempo real (ausente → válido → lixo ×4 → corrigido → campo inválido → dispensado → valor hostil) | acompanha sem recarregar; mantém os 16 NPCs; XSS inerte | `final.spec.ts` (5º) |
| Expiração: 8 h ociosa, 24 h absoluta, `peekKey` não renova, `remove()`, cookies lixo, persistência × restart | OK (relógio injetado) | `session-limits.test.ts` |
| `token:rotate` com a página aberta | tela do atalho, 0 clientes, sem laço | `resilience.spec.ts`, `adversarial.test.ts` |
| 60 Freelancers; JSON hostil no hook; rajada de 1 000 eventos | teto de 12, ≤ 30 fps, sem 5xx | `viewport.spec.ts`, `adversarial.test.ts` |
| Console durante um passeio completo (hooks, painéis, atalhos, idioma, logout) | sem avisos; único erro = OBS-01 | `final.spec.ts` (último) |

Observação (não é bug): o som ligado fica salvo no servidor, mas a interface sempre abre **mudo** (CA-77: som começa mudo); "volumes e escolhas persistem" é Could da fase 4.

## 5. Medições (Edge 157 headless, GPU real, 60 s por cenário, 1920×1080, DPR 1; servidor de teste em porta aleatória e home temporária)

CPU = % de **um** núcleo, soma de todos os processos do navegador. Aba oculta simulada por `visibilityState`.

| Cenário | CPU total | renderer + GPU | fps | máx. quadros em 1 s | Alvo | Resultado |
|---|---|---|---|---|---|---|
| S1 parado, visível (16 NPCs ociosos) | 3,25 % | 1,79 + 1,28 | 5,7 | 7 | ≤ 5 % (M-02) | OK |
| S2 parado, aba oculta | 0,31 % | 0,15 + 0,02 | 0 | 0 | ≤ 1 % (M-03) | OK |
| S3 realista: 5 NPCs trabalhando (hooks reais) | 4,15 % | 2,13 + 1,88 | 5,4 | 6 | ≤ 5 % | OK |
| S8 realista: 2 NPCs andando (faixa de 20 fps) | 10,46 % | 5,25 + 5,09 | 18 | 19 | — | informativo |
| S4 realista: 5 NPCs andando (faixa de 30 fps) | 15,36 % | 7,52 + 7,71 | 26,3 | 28 | — | acima da meta de 10 % do pior caso |
| S6 pior caso: 20 andando + chuva + noite | 17,32 % | 8,64 + 8,59 | 26,4 | 28 | ≤ 10 % (R2) | **desvio conhecido confirmado** (spike: 14,5 %) |
| S5 5 trabalhando com atividade, aba oculta | 0,51 % | 0,33 + 0,06 | 0 | 0 | ≤ 1 % | OK |
| S7 pior caso, aba oculta | 0,25 % | 0,16 + 0,03 | 0 | 0 | ≤ 1 % | OK |

Leitura: o custo vem da **faixa de fps** (≈ 6 fps ≈ 3–4 %; 20 fps ≈ 10 %; 30 fps ≈ 15–17 %), não do número de NPCs. M-01 ok (máx. 28 quadros em 1 s, nunca > 30). Esta rodada ficou ~1–2 pontos acima da anterior (carga da máquina), a conclusão não muda.

| Métrica | Medido | Alvo | Resultado |
|---|---|---|---|
| M-05 hook → NPC "trabalhando" (50 amostras, dentro da página) | p50 140 ms · **p95 142 ms** · máx. 144 ms (e2e: p95 128 ms, máx. 139 ms; a amostra "mín. 0" do script é artefato do poller) | p95 ≤ 1 s, máx. 2 s | OK |
| M-04 CPU do servidor ocioso (1 navegador, 59 s) | **0,11 %** | ≤ 2 % | OK |
| M-04 memória do servidor | 93,0 → 79,6 MB em 59 s | < 50 MB em 8 h | sem sinal de vazamento (8 h não medidas) |
| Subida do servidor (5 partidas a frio) | mediana **950 ms** (931–1206 ms) até a 1ª resposta HTTP | informar | — |
| Bundle web (gzip) | JS **143,3 kB**, CSS 3,3 kB, total 154,3 kB | ≤ 400 kB | OK |
| Memória da página, 16 trabalhando + Freelancers + painéis (`QA_MEM_SECONDS=30` na rodada; 180 s na anterior: heap 5,2 → 6,8 MB, DOM 106 nós, 192 listeners, constantes) | estável | estável | OK |

Não medido: CPU de 10 min, Edge com janela, aba oculta real, servidor por 8 h.

## 6. Contraste WCAG

`node scripts/check-contrast.mjs` + `tests/integration/fase1/contrast.test.ts`: 73 pares do GUIA-VISUAL §4, **0 reprovados, 0 divergentes** (maior diferença para os números à mão da Bianca: 0,006). Menor texto: `danger-text` / `bg-700` 4,83; `ink` / `dept-qualidade-base` 4,94. Menor UI: `border-strong` / `bg-700` 3,37. Negativo documentado confere (`meter-red` como texto em `bg-700` = 4,17 e não é usado). 14 regras de `app.css` ≥ 4,5 (desabilitado isento, OBS-05). Não coberto: texto desenhado dentro do canvas.

## 7. Pendências manuais

Sessão real do Desktop e aplicar o diff no `settings.json` (T-32, gate G4); skill `rh-equipe` (T-29); CPU de 10 min (`node scripts/perf/measure-fase1.mjs --seconds 600`); Edge com janela; servidor por 8 h. Resultado de performance vai para `test-results/` por padrão e o Playwright limpa essa pasta: use `--out`.
