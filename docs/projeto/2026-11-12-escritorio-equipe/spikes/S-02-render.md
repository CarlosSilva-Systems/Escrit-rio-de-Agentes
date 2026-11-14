# S-02 — Render spike (Canvas 2D), versão reduzida

> Autora: Lívia (dev-web) · Data: 2026-11-13 · Referência: ADR-0002 (R1–R7), TAREFAS S-02.
> Escopo reduzido pelo chefe: mede só o **Canvas 2D próprio**; PixiJS **não** foi comparado (o ADR só pede isso se o Canvas estourar o orçamento — ver "Decisão").

## Cena medida
Mapa real `assets/map/mapa.json` (64×52 tiles, 1024×832 px a 1×), 4 salas de projeto apagadas + noite nos cenários C/D, **20 sprites** andando por A* (`?demo=20`, semente 1, 48 px/s), viewport **1920×1080**, zoom **3×**, DPR 1. Arte provisória gerada por código (atlas procedural). Cenário "chuva" = riscos descendo nas janelas (`?rain=1`), "noite" = `?debugTime=2026-12-24T21:00:00-03:00`.

## Método
- Script: `spikes/render/measure.ts` (`npx tsx spikes/render/measure.ts`; `S02_SECONDS`, `S02_HEADED=1`). Resultado bruto em JSON no mesmo script.
- Navegador: Edge 157.0.4341.46, `--headless=new`, GPU real habilitada (AMD Radeon + NVIDIA RTX 3060 Laptop; `2d_canvas`, `gpu_compositing`, `rasterization` = enabled).
- CPU: CDP `SystemInfo.getProcessInfo` (segundos de CPU acumulados por processo); % de **um núcleo** = Δ CPU / Δ relógio, janela de **60 s** por cenário, após 4 s de aquecimento.
- Quadros: o motor registra o instante de cada quadro desenhado (`?debug`); "máx. em 1 s" = maior número de quadros em qualquer janela deslizante de 1 000 ms.
- Aba oculta: simulada sobrescrevendo `document.visibilityState`/`hidden` e disparando `visibilitychange` (o Edge headless não esconde abas de verdade).

## Resultados (medidos)

| # | Critério (ADR-0002) | Meta | Medido | Resultado |
|---|---|---|---|---|
| R1 | CPU visível, NPCs parados (só ambiente, 9,8 fps) | ≤ 5 % de 1 núcleo (renderer + GPU) | renderer 2,8 % + GPU 2,8 % = **5,6 %** (browser 0,7 %) | **Estoura por 0,6 pp** |
| R2 | Pior caso (20 andando + chuva + noite + 4 salas) | ≤ 10 % e ≥ 24 fps | renderer 7,8 % + GPU 8,2 % = **16,1 %**; **28,8 fps** | fps OK; **CPU estoura** |
| — | 20 andando, dia, sem chuva (uso normal) | — | renderer 7,9 % + GPU 7,9 % = **15,9 %**; 28,8 fps | — |
| R3 | Aba oculta | 0 quadros; ≤ 1 % CPU | **0 quadros** em 60 s (`renderedWhileHidden` = 0); renderer 0,1 % + GPU 0,0 % = **0,2 %** | **OK** |
| R4 | Nitidez | só cores já existentes no buffer 1× (sem cor interpolada) | DPR 1 (escala 3), 1,25 (escala 4), 1,5 (escala 5): **0 cores estranhas** (929 / 757 / 612 cores na tela, todas presentes nas 1 633 do buffer) | **OK** |
| R5 | Teto de quadros | nunca > 30 quadros em 1 s | máx. **29** em qualquer janela de 1 s (60 s × 3 cenários); média 28,8 fps com movimento e 9,8 fps parado | **OK** |
| R6 | Tamanho adicionado | informar | renderer = **0 dependência**; bundle web inteiro (React + zod + motor + HUD) **133,7 kB gzip JS + 2,6 kB CSS** (orçamento 400 kB) | OK |
| R7 | Retomar após oculto | ≤ 500 ms | 10 amostras: **2,2–3,0 ms** até o 1º quadro | **OK** |

Tempo de quadro no thread principal (só as chamadas de desenho, sem o trabalho da GPU): p50 0,5–0,6 ms, **p95 0,6 ms (parado) / 0,8–0,9 ms (andando)**, bem abaixo dos 4 ms do orçamento. Qualidade automática ficou em `high` (nenhuma degradação foi necessária). Testes automatizados (`tests/e2e/office.spec.ts`) repetem R3/R4/R5/R7 e um teto de 10 % do thread principal ocioso.

## O que a medição mostrou (e um bug que ela pegou)
A primeira rodada mostrou o thread principal a **100 %** mesmo parado: era um laço de renderização do React na barra superior (valor padrão de `now` recriado a cada render refazia o efeito do relógio). Corrigido; o teste e2e "M-02" agora falha se o thread principal ocioso passar de 10 %. Os números da tabela são **depois** da correção.

## Decisão (regra do ADR: Canvas vence se passar R1–R5 e R7)
- R2 (CPU) e R1 (por 0,6 pp) **não passam** pelo critério literal; fps, teto de quadros, nitidez, aba oculta e retomada passam com folga.
- **Ressalvas que pesam na leitura:** (1) janela de 60 s, não 10 min; (2) Edge headless — o Edge com janela pode ter custo de composição diferente (rode `S02_HEADED=1 npx tsx spikes/render/measure.ts` para os números "reais" na tela do Carlos); (3) o CPU da GPU aqui é do processo GPU em GPU híbrida (AMD+NVIDIA), e metade do gasto do pior caso vem do **mesmo** trabalho com e sem chuva/noite (15,9 % vs 16,1 %), ou seja, o custo é de apresentar um buffer 1 024×832 ampliado a 1080p a ~29 fps, não dos efeitos.
- **Recomendação:** não trocar para PixiJS ainda. Antes, aplicar otimizações baratas já mapeadas (redesenhar só a região suja em vez de recopiar a camada estática inteira; pular `multiply`/`lighter` quando nada mudou; fps de 20 quando só 1–3 NPCs andam) e **repetir a medição com janela de 10 min e Edge com janela**. Só se continuar acima de 10 % com margem ≥ 30 % de vantagem do Pixi, abrir o novo ADR. A decisão final é do Arquiteto/Carlos.

## Não medido / limites
- PixiJS 8 não foi implementado nem medido (fora do escopo reduzido).
- 10 min por cenário não foram rodados (60 s); CPU de longo prazo e memória não medidos.
- Aba oculta real (troca de aba/minimizar) não medida: simulada por `visibilitychange`.
- Mascotes, partículas e falas dos NPCs ainda não existem; o custo deles não está incluído.

## Rodada 2 — otimização do Canvas (2026-11-13, mesma metodologia)

Mudanças: (1) região suja (restaura só onde um sprite apareceu/moveu/animou da base sem luz, redesenha, reilumina e reapresenta só esse retângulo); quadro sem mudança não desenha nada; (2) `multiply`/`lighter` só nas regiões sujas; (3) 20 fps quando 1–3 NPCs andam (30 com mais, com arraste ou seguindo); (4) ritmo só-ambiente 10 → 6 fps; (5) arte procedural convertida uma vez em `ImageBitmap`. Cena igual à da rodada 1, com **NPCs reais da equipe** no cenário A (um NPC aguardando aprovação anda até a fila da Diretoria).

| Cenário | Antes (renderer + GPU) | Depois (renderer + GPU) | Meta |
|---|---|---|---|
| A. parado (só ambiente) | 5,6 % (2,8 + 2,8), 9,8 fps | **4,0 %** (2,2 + 1,8) | ≤ 5 % — **atingida** |
| B. 20 andando, dia | 15,9 % | **14,3 %** (7,0 + 7,3), 28,8 fps | — |
| C. pior caso (20 + chuva + noite) | 16,1 % | **14,5 %** (7,2 + 7,4), 28,8 fps | ≤ 10 % — **não atingida** |
| D. aba oculta | 0,2 %, 0 quadros | 0,2 %, 0 quadros | ≤ 1 % — OK |
| Quadros máx. em 1 s / R7 / R4 | 29 / 3 ms / 0 cores estranhas | 29 / 3,4 ms / 0 cores estranhas | OK |

### O que funcionou e o que não funcionou
- **Parado:** a região suja e a queda do ritmo ambiente resolveram o R1.
- **Andando:** a região suja piorou o pior caso quando há muitos regiões pequenas (20 NPCs: **20,6–21,4 %** contra **14,8–15,5 %** com redesenho total, A/B de 40 s com `?dirty=0`). Cada região paga recorte + restauração + iluminação + uma apresentação própria. Por isso o motor usa região suja só até 3 regiões e volta ao redesenho total acima disso (valor medido, `MAX_DIRTY_REGIONS`).
- `ImageBitmap` não mudou o custo de forma mensurável (15,5 → 14,8 % no A/B).
- Tempo de quadro no thread principal continua ≈ 0,8–1,2 ms (p95); o gasto restante é **apresentar o canvas 1920×1080 a ~29 fps** (renderer + processo GPU ≈ 7 % cada), não o desenho em si.

### O que falta para ≤ 10 % no pior caso (não feito)
1. Medir com Edge **com janela** (`S02_HEADED=1`): o headless pode custar mais de composição.
2. Reduzir o trabalho de apresentação: renderizar o canvas em resolução menor e ampliar por CSS `image-rendering: pixelated` só quando `escala/DPR` é inteiro (DPR 1 e 2), mantendo a regra de nitidez; ou 24 fps (o ADR aceita ≥ 24) quando ≥ 4 NPCs andam (estimativa ≈ 12 %, ainda acima de 10 %).
3. Se nada disso bastar, a comparação com PixiJS (WebGL) do S-02 completo passa a ser justificada: o ganho esperado está justamente na apresentação.
