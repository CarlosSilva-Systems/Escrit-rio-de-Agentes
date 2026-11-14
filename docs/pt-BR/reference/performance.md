# Referência: desempenho medido

[🇺🇸 English](../../en/reference/performance.md) · [Índice da documentação](../README.md)

Números da rodada final de QA da Fase 1 (relatório `docs/projeto/2026-11-12-escritorio-equipe/QA-FASE-1.md`). Condições: Edge 157 headless com GPU real, janelas de 60 segundos, 1920×1080 com densidade de pixels 1, servidor de teste em porta de loopback aleatória e pasta de dados temporária. CPU é a porcentagem de **um** núcleo, somada em todos os processos do navegador.

## CPU do navegador e quadros por segundo

| Cenário | CPU | fps | Meta | Resultado |
|---|---|---|---|---|
| Parado, aba visível (16 NPCs) | 3,25 % | 5,7 | ≤ 5 % | atingida |
| Parado, aba oculta | 0,31 % | 0 | ≤ 1 % | atingida |
| 5 NPCs trabalhando (um evento de hook por segundo) | 4,15 % | 5,4 | ≤ 5 % | atingida |
| 2 NPCs andando | 10,46 % | 18 | informativo | — |
| 5 NPCs andando | 15,36 % | 26,3 | pior caso ≤ 10 % | acima da meta |
| Pior caso: 20 andando + chuva + noite | 17,32 % | 26,4 | ≤ 10 % | **acima da meta** (desvio conhecido, a tratar na Fase 4; o spike mediu 14,5 %) |
| 5 trabalhando, aba oculta | 0,51 % | 0 | ≤ 1 % | atingida |
| Pior caso, aba oculta | 0,25 % | 0 | ≤ 1 % | atingida |

O custo acompanha a taxa de quadros (cerca de 6 fps ≈ 3–4 %, 20 fps ≈ 10 %, 30 fps ≈ 15–17 %), não o número de NPCs. Nenhum cenário passou de 30 quadros em um mesmo segundo (máximo observado: 28).

## Latência, servidor e tamanho

| Métrica | Medido | Meta | Resultado |
|---|---|---|---|
| Hook até NPC "trabalhando", 50 amostras | p50 140 ms, **p95 142 ms**, máx. 144 ms | p95 ≤ 1 s, máx. ≤ 2 s | atingida |
| CPU do servidor ocioso (59 s, um navegador) | 0,11 % | ≤ 2 % | atingida |
| Memória do servidor | 93,0 → 79,6 MB de working set em 59 s | < 50 MB em 8 h | sem sinal de vazamento; 8 h não medidas |
| Partida a frio até a primeira resposta HTTP (5 execuções) | mediana 950 ms (931–1206) | informativo | — |
| Bundle web, gzip | JS 143,3 kB + CSS 3,3 kB = 154,3 kB | ≤ 400 kB | atingida |
| Memória da página, 180 s com 16 NPCs trabalhando e visitantes | heap 5,2 → 6,8 MB, nós DOM e listeners estáveis | estável | atingida |
| Contraste (WCAG) | 73 pares de cores, 0 reprovados | ≥ 4,5:1 texto, ≥ 3:1 interface | atingida |

Não medido: execução de CPU de 10 minutos, Edge com janela visível, aba realmente oculta, servidor rodando 8 horas.

## Reproduzir

```
npm run perf:fase1            # execução de 60 s em pastas e portas temporárias
node scripts/perf/measure-fase1.mjs --seconds 600
npm run qa:contrast
```

Nunca toca no servidor real da porta 3200 nem no `~/.claude`. Os resultados vão para `test-results/perf-fase1.json` (use `--out` para guardá-los; o Playwright limpa essa pasta).

## Relacionado

- [Limitações conhecidas](../explanation/limitations.md)
- [Por que Canvas 2D](../explanation/why-canvas-2d.md)
