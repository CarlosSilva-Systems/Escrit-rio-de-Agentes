# QA da Fase 1 — relatório (T-33)

> Autora: Teresa (QA) · Base: `MATRIZ-CA.md` (cobertura CA → teste). Rodado contra o working tree (sem commit). Bruno e Lívia aplicaram correções em paralelo durante a rodada: o estado de cada BUG abaixo vale para a última execução (campo "Estado").

## 1. Veredito

A Fase 1 está **pronta com ressalvas**: nenhum bug crítico, servidor sólido sob abuso (payloads hostis, rajada de 1 000 eventos, queda e volta do servidor, rotação de token, XSS), HUD e motor estáveis em todos os tamanhos/DPR testados, contraste 100 % conforme. Pendem 2 CAs "Must" com metade do critério não atendida (CA-13 aviso visual, CA-19 fechar clicando fora), 1 lacuna de CA-18 (aviso do Desktop) e itens manuais (sessão real do Desktop, CPU de 10 min).

## 2. Bugs

| ID | Sev. | CA | Resumo | Estado |
|---|---|---|---|---|
| BUG-01 | Alta | CA-13 | O painel **não mostra aviso** (arquivo e campo) quando `escritorio.json` é inválido. O servidor mantém o último válido e publica `diag`, mas nada renderiza `snapshot.diagnostics`. | Aberto (teste `test.fail` em `tests/e2e/fase1/content.spec.ts`) |
| BUG-02 | Média | CA-19 | O painel do NPC não fecha clicando fora (só Esc ou botão Fechar). | Aberto (`test.fail`) |
| BUG-03 | Baixa | CA-14 | Texto longo sem espaço (ex.: título de 60 caracteres) faz a gaveta da Equipe rolar na horizontal. | Aberto (`test.fail`) |
| BUG-04 | Baixa | CA-03 | `token:rotate` só derruba WebSockets abertos na **próxima requisição HTTP** (o ping do WS não dispara a leitura dos arquivos); num escritório ocioso a sessão antiga segue recebendo dados. | Aberto (`it.fails` em `tests/integration/fase1/adversarial.test.ts`) |
| BUG-05 | Baixa | CA-14/CA-23 | O teste **pré-existente** `tests/e2e/npcs.spec.ts :: CA-14: the team list reaches every NPC by keyboard…` passou a falhar no estado atual da árvore: depois de fechar o painel com Esc, 2 Esc a mais já não param o "Seguindo" (`following` continua visível). Hipótese: a cascata de Esc agora tem um passo extra (cartão de hover, ver OBS-04). Esperado: ajustar o teste (mais um Esc) ou encurtar a cascata. Local: `src/web/App.tsx:35-46`, `tests/e2e/npcs.spec.ts:~224`. | Aberto (Lívia decide; não alterei teste alheio) |
| REG-01 | Média | CA-13 | `tests/integration/team.test.ts :: CA-13: a watcher on a not-yet-existing directory attaches when it is created` falha no estado atual: `writeFileAtomic` (`src/server/home/fsAtomic.ts:47`) lança ENOENT quando a pasta ainda não existe. Surgiu durante as correções paralelas do Bruno (verde no início desta rodada). | Aberto (Bruno) |

Reprodução e local provável:

- **BUG-01.** Passos: abrir o painel; editar `~/.claude/equipe/escritorio.json` (cópia de teste) para JSON truncado ou `"agents": []`. Esperado: aviso visível "escritorio.json · agents …". Obtido: nada na tela (NPCs ficam corretos). Local: `src/web/store/appState.ts:138-139` guarda `diagnostics`; nenhum componente de `src/web/hud/**` nem `App.tsx` o lê. Sugestão: renderizar na `NoticeBar`/faixa de avisos com i18n.
- **BUG-02.** Passos: Equipe → clicar num NPC → clicar no mapa. Esperado: painel fecha. Obtido: permanece. Local: `src/web/hud/npc/NpcPanel.tsx` (sem handler), `src/web/App.tsx:35-46` (só Esc), `src/web/OfficeView.tsx` `onNpcClick` ignora clique no vazio.
- **BUG-03.** Passos: `title` de 60 `M` seguidos no `escritorio.json` → abrir Equipe. Esperado: sem rolagem lateral. Obtido: `scrollWidth - clientWidth` ≈ 276 px. Local: `src/web/styles/app.css:537` `.team-row__text` (adicionar `overflow-wrap: anywhere`).
- **BUG-04.** Passos: abrir o painel, rodar `token:rotate`, não fazer nenhuma requisição. Esperado: socket fechado (4401) em poucos segundos. Obtido: segue aberto. Local: `src/server/http/auth/plugin.ts:99-103` (releitura só no `onRequest`, 1/s) e `src/server/app.ts:153-158`. Sugestão: timer `unref` de 1 s chamando `tokens.reloadIfChanged()`.

## 3. Observações e lacunas (sem teste vermelho)

- **GAP-01 (Baixa)** `npm run credits:check` (CLAUDE.md, T-23) não existe em `package.json`; sugestão de script no §8.
- **GAP-02 (Média)** CA-18: o aviso "sessões do Desktop não detectadas" não existe na interface; a gate G4/T-32 (sessão real) segue manual.
- **OBS-01** `GET /assets/sprites/manifest.json` e `/assets-private/sprites/manifest.json` dão 404 em todo carregamento e o navegador registra "Failed to load resource" como erro no console (arte opcional ausente). Único ruído de console encontrado; o resto são `ERR_CONNECTION_REFUSED` esperados durante quedas do servidor. Nenhum aviso (warning).
- **OBS-02** Não há teto de Freelancers no servidor: 300 tipos desconhecidos viram 300 NPCs no `/api/state` (< 500 kB).
- **OBS-03** O mapa só tem assentos para ~15 visitantes: de 60 Freelancers simultâneos o mapa desenha 15 (a lista da Equipe lista todos). Fps e responsividade seguem ok.
- **OBS-04** Com foco numa linha da Equipe, o drawer precisa de 3 Esc (painel, cartão, gaveta). Coerente com o desenho, pode parecer lento.
- **OBS-05** `.btn:disabled` (texto `text-disabled` sobre `bg-700`) dá 2,97:1; o guia só garante ≥ 3 sobre `bg-800` (3,61). Isento pela WCAG (componente inativo).
- Os scripts citados na arquitetura (`scripts/perf/measure-cpu.ps1`, `typeperf`) foram substituídos por `scripts/perf/measure-fase1.mjs` (CPU via CDP e `Get-Process`).

## 4. Medições (Edge 157 headless, GPU real, janela de 60 s, 1920×1080, DPR 1; servidor de teste em porta aleatória e home temporária)

CPU = % de **um** núcleo, soma de todos os processos do navegador (renderer + GPU + browser + utilitários). Aba oculta simulada via `visibilityState` (limitação herdada do S-02).

| Cenário | CPU total | renderer + GPU | fps | máx. quadros em 1 s | Alvo | Resultado |
|---|---|---|---|---|---|---|
| S1 parado, aba visível (16 NPCs ociosos) | 2,76 % | 1,52 + 1,09 | 6 | 7 | ≤ 5 % (M-02) | OK |
| S2 parado, aba oculta | 0,24 % | 0,14 + 0,02 | 0 | 0 (0 quadros) | ≤ 1 % (M-03) | OK |
| S3 realista: 5 NPCs trabalhando (hooks reais a cada 1 s) | 3,48 % | 1,88 + 1,50 | 6 | 7 | ≤ 5 % | OK |
| S8 realista: 2 NPCs andando (faixa de 20 fps) | 8,95 % | 4,13 + 4,07 | 19,5 | 21 | — | informativo |
| S4 realista: 5 NPCs andando (faixa de 30 fps) | 15,34 % | 7,44 + 7,81 | 28,6 | 29 | — (pior caso ≤ 10 %) | acima do alvo do pior caso |
| S6 pior caso: 20 andando + chuva + noite | 15,71 % | 7,63 + 8,02 | 28,8 | 29 | ≤ 10 % (R2) | **desvio conhecido confirmado** (spike: 14,5 %) |
| S5 5 trabalhando com atividade, aba oculta | 0,47 % | 0,30 + 0,06 | 0 | 0 | ≤ 1 % | OK |
| S7 pior caso, aba oculta | 0,22 % | 0,14 + 0,02 | 0 | 0 | ≤ 1 % | OK |

Leitura: o custo é quase todo da **faixa de fps** (6 fps parado ≈ 3 %, 20 fps ≈ 9 %, 30 fps ≈ 15 %), não do número de NPCs: com 5 NPCs andando já se paga o mesmo que com 20. Nenhum cenário passa de 30 quadros em 1 s (M-01 ok; máx. 29).

| Métrica | Medido | Alvo | Resultado |
|---|---|---|---|
| M-05 latência hook → NPC "trabalhando" (50 amostras, medida dentro da página) | p50 140 ms · **p95 143 ms** · máx. 159 ms (e2e: p95 128 ms, máx. 140 ms) | p95 ≤ 1 s, máx. 2 s | OK |
| M-04 CPU do servidor ocioso (1 navegador, 59 s) | **0,05 %** | ≤ 2 % | OK |
| M-04 memória do servidor | 92,9 → 79,1 MB de working set em 59 s (sem crescimento); 8 h não medidas | < 50 MB em 8 h | sem sinal de vazamento |
| Subida do servidor (5 partidas a frio do bundle) | mediana **849 ms** (820–902 ms) até a primeira resposta HTTP | informar | — |
| Bundle web (gzip) | JS **140,2 kB**, CSS 3,1 kB, total 151,0 kB | ≤ 400 kB | OK |
| Memória da página, 16 NPCs trabalhando + Freelancers (~20 no mapa), hooks e painéis abrindo/fechando | ver §5 | estável | ver §5 |

Não medido: CPU de 10 min (rodar `node scripts/perf/measure-fase1.mjs --seconds 600`), Edge com janela (GPU real do monitor), aba oculta de verdade, servidor por 8 h.

## 5. Memória / vazamentos (teste `tests/e2e/fase1/memory.spec.ts`, `QA_MEM_SECONDS`, padrão 180 s)

180 s com 16 NPCs trabalhando o tempo todo + Freelancers entrando/saindo (~20 no mapa), 6 eventos de ferramenta por rodada e Equipe/painel abrindo e fechando (GC forçado antes de cada amostra):

| t (s) | heap da página (MB) | nós DOM | listeners | heap do servidor* (MB) | clientes WS |
|---|---|---|---|---|---|
| 0 | 5,2 | 103 | 192 | 80,0 | 1 |
| 60 | 6,5 | 106 | 192 | 50,9 | 1 |
| 121 | 6,7 | 106 | 192 | 55,1 | 1 |
| 181 | 6,8 | 106 | 192 | 57,8 | 1 |
| 191 (após esvaziar Freelancers) | 6,7 | 106 | 192 | 50,6 | 1 |

Heap da página +0,5 MB depois do aquecimento (platô), **DOM e listeners constantes** (sem vazamento de listeners ao longo de 4 quedas do servidor também: §7). *heap do servidor em processo junto do runner, só indicativo.

## 6. Contraste WCAG (`node scripts/check-contrast.mjs`, teste `tests/integration/fase1/contrast.test.ts`)

- 73 pares do GUIA-VISUAL §4 (4.1 texto, 4.2 fundos coloridos, 4.3 UI/foco): **0 reprovados**, **0 divergentes** (maior diferença para os números da Bianca: 0,006; o limite era 0,05).
- Menor texto: `danger-text` sobre `bg-700` 4,83; `ink` sobre `dept-qualidade-base` 4,94; `terra-300` sobre `bg-700` 4,96. Menor UI: `border-strong` sobre `bg-700` 3,37.
- Negativo documentado confere: `meter-red` como texto sobre `bg-700` dá 4,17 (< 4,5) e o `app.css` não o usa como texto.
- 14 regras `color: var(--token)` de `app.css` verificadas (pior fundo quando não declara): todas ≥ 4,5 (exceto o desabilitado isento, OBS-05).
- `docs/design/tokens.css` e `src/web/styles/tokens.css` têm os mesmos valores de cor (comparação por valor, ignorando a formatação do Prettier).
- Não coberto: texto desenhado dentro do canvas (placas/crachás em sprite) — só vale a tabela 4.2 do guia.

## 7. Caça a bugs: o que foi tentado

| Cenário | Resultado | Onde |
|---|---|---|
| Matar/religar o servidor 4× com a página aberta; "Tentar agora" | Recupera sozinho; 1 socket aberto na página e 1 cliente no hub (sem vazamento) | `resilience.spec.ts` |
| Token rotacionado com a página aberta; cookie forjado | Tela "abra pelo atalho", sem laço de reconexão; sem WS com cookie falso | `resilience.spec.ts` (+ BUG-04) |
| 3 abas simultâneas; fechar uma | Todas sincronizadas; hub conta certo | `resilience.spec.ts` |
| 16 NPCs trabalhando + Freelancer indo e vindo 8× | ≤ 30 fps, sem erro de console, volta a ocioso, sem fantasmas | `resilience.spec.ts` |
| Rajada de 1 000 eventos (HTTP e UI) | 1 000 aceitos (204), contadores exatos, ring ≤ 500, página responsiva, ≤ 30 fps | `adversarial.test.ts`, `viewport.spec.ts` |
| 17 corpos malformados/gigantes (aninhamento de 50 000 níveis, NUL, UTF-8 inválido, chaves duplicadas, `__proto__`…), limite exato de 1 MB | Nunca 5xx (202/204/413); sem poluição de protótipo | `adversarial.test.ts` |
| `agent_type` HTML/RTL/NUL/10 000 caracteres/`constructor`… | Vira "unknown" ou nome seguro; nunca markup | `adversarial.test.ts` |
| XSS em apelido, nome, cargo, estúdio, departamento, pasta do `cwd`, assunto de tarefa, aviso de novo membro | Tudo como texto; nada executa; nenhum nó injetado; nenhum diálogo | `content.spec.ts` |
| Nomes longos (24/60/60) | Cartão dentro da janela, sem rolagem da página (BUG-03 só para palavra sem espaço) | `content.spec.ts` |
| Zoom/pan extremos (80 ticks de roda, 5 000 px de arraste, +/- ×30) e parâmetros de URL absurdos | Zoom sempre 2–4×, mapa sempre visível, página íntegra | `viewport.spec.ts` |
| 1280×720 a 2560×1440 × DPR 1/1,25/1,5; redimensionar em movimento até 390×844 | Escala inteira, canvas = caixa × DPR, sem barras, segue desenhando | `viewport.spec.ts` |
| Tab/Shift+Tab em tudo (com gaveta e painel abertos); Esc em cascata | Foco visível em todas as paradas, sem armadilha | `content.spec.ts` |
| `prefers-reduced-motion` | 0 animações CSS em execução; status continua em texto | `viewport.spec.ts` |
| Trocar idioma com painel e cartão abertos | Traduz no lugar, sem fechar | `content.spec.ts` |
| Aba oculta com hooks chegando; retomada | 0 quadros ocultos; NPC já "trabalhando" ao voltar; sem teletransporte | `viewport.spec.ts` |
| `escritorio.json` e QUADRO.md editados com lixo em tempo real | Mantém o último válido e os 16 NPCs; arquivo corrigido é relido (BUG-01: sem aviso visual) | `content.spec.ts` |
| WebSocket: 80 mensagens/s, 21º cliente, binário/lixo/tipos desconhecidos | 1008, 1013 e ignorado, respectivamente; o servidor segue servindo | `adversarial.test.ts` |
| Rede/privacidade (CA-09, CA-64) | Só conexões 127.0.0.1; nenhum processo `claude`; canário não vaza | `compliance.test.ts`, `adversarial.test.ts`, `content.spec.ts` |

## 8. Pendências e sugestões

- Manuais: sessão real do Desktop (T-32/G4), skill `rh-equipe` (T-29), CPU de 10 min, Edge com janela.
- Marcas de falha esperada: ao corrigir cada BUG, remover `test.fail(...)`/`it.fails` do teste correspondente (ele passará a ser um teste normal).
- Sugestões para o `package.json` (não editado por mim): `"qa:contrast": "node scripts/check-contrast.mjs"`, `"perf:fase1": "node scripts/perf/measure-fase1.mjs --seconds 60"`, `"credits:check"` (GAP-01), e rodar o e2e com `QA_MEM_SECONDS=30` em CI curto.
- O Playwright apaga `test-results/` a cada execução (os resultados de performance vão para `test-results/perf-fase1.json` por padrão: use `--out` para guardá-los noutro lugar).

## 9. Estado final desta rodada (árvore em movimento)

`npm run test:unit` 456 verdes; `test:int` 186 verdes + 1 falha esperada, **2 vermelhos que não são meus** (REG-01 acima e `tests/integration/auth.test.ts :: CA-03: ticket -> cookie ...`, REG-02, para o Bruno); `npm run lint` pega só `prettier` em `src/cli/client.ts` (arquivo em edição do Bruno); Playwright: 68 verdes de 70 + 5 falhas esperadas (BUG-01/02/03 e 2 outros marcados), 1 falha real (BUG-05) e 1 intermitente de rede local no DPR 1,5 (passou ao repetir). `node scripts/verify-baseline.mjs` -> idêntico.
