# Referência: cobertura dos requisitos (Fase 1)

[🇺🇸 English](../../en/reference/requirements-coverage.md) · [Índice da documentação](../README.md)

A Fase 1 é coberta pelos critérios de aceite CA-01 a CA-25. A matriz oficial, teste a teste, é a [`MATRIZ-CA.md`](../../projeto/2026-11-12-escritorio-equipe/MATRIZ-CA.md); os achados e medições de QA estão em [`QA-FASE-1.md`](../../projeto/2026-11-12-escritorio-equipe/QA-FASE-1.md); os requisitos em si estão em [`REQUISITOS.md`](../../projeto/2026-11-12-escritorio-equipe/REQUISITOS.md). Os testes citam o critério que cobrem (`it('CA-16: …')`), então `grep -rn "CA-16" src tests` os encontra.

## Resumo por critério

"Automatizado" significa que um teste unitário, de integração ou de ponta a ponta passa. "Parte manual" é o que só você pode fazer ou só uma execução longa consegue medir.

| CA | Tema | Situação |
|---|---|---|
| 01 | Escuta só em `127.0.0.1:3200` | Automatizado |
| 02 | Porta ocupada é erro claro, nunca outra porta | Automatizado |
| 03 | Token obrigatório, 256 bits, tempo constante, nunca logado | Automatizado (a rotação de token fecha os sockets em cerca de um segundo; veja a nota) |
| 04 | Pixel Agents instalado intocado (hashes de referência) | Automatizado (`npm run verify:baseline`) |
| 05 | Licença MIT, NOTICE e CREDITS nos dois idiomas, tela de Créditos | Automatizado (o `npm run credits:check` já existe) |
| 06 | No máximo 30 quadros por segundo | Automatizado |
| 07 | Aba oculta não desenha, sem teletransporte ao voltar | Automatizado |
| 08 | CPU: visível ≤ 5 %, oculta ≤ 1 %, servidor ≤ 2 % | 60 s medidos; a execução de 10 min é a parte manual. Pior caso acima da meta, veja [Desempenho](performance.md) |
| 09 | Sem `claude -p`, SDK ou API paga; sem rede externa | Automatizado (checagens estática e em execução) |
| 10 | pt-BR padrão, inglês sem recarregar, mesmas chaves | Automatizado |
| 11 | Todas as salas fixas presentes, cores de departamento | Automatizado |
| 12 | Exatamente 16 NPCs com nomes e cargos corretos | Automatizado; a aprovação da lista de nomes (gate G1) é sua |
| 13 | `escritorio.json` ausente ou inválido dá aviso e mantém o último válido | Automatizado, inclusive o aviso na tela |
| 14 | Cartão de hover em até 150 ms | Automatizado |
| 15 | Chamar um agente faz o NPC trabalhar em menos de 1 s | Automatizado (p95 de 142 ms) |
| 16 | Stop comemora; dois starts e um stop continua trabalhando | Automatizado |
| 17 | Tipo desconhecido vira Freelancer, trocado ao entrar na equipe | Automatizado |
| 18 | NPCs aparecem para sessões do Claude Desktop; aviso se não detectadas | Alternativa por arquivos automatizada; a sessão real do Desktop é a parte manual (gate G4) |
| 19 | Clique abre o painel (10+ atividades); Esc ou clique fora fecha | Automatizado |
| 20 | Diff do settings antes, aprovação, backup, mescla aditiva, reversível | Automatizado em cópias temporárias; aplicar no arquivo real é a parte manual (gate G4) |
| 21 | `rh-equipe` mantém o `escritorio.json`; cenas de boas-vindas e despedida | Cenas e `team:check` automatizados; a atualização da skill está pendente (fora do repositório) |
| 22 | `prefers-reduced-motion` | Automatizado |
| 23 | Atalhos C/T/A/M, Tab com foco visível, Esc | Automatizado |
| 24 | Contraste ≥ 4,5:1 texto e ≥ 3:1 interface; cor nunca é o único sinal | Automatizado (`npm run qa:contrast`) |
| 25 | Testes de máquina de estados, evento para NPC, contratos, rotas | Automatizado (a leitura do `PLANO.md` é da Fase 3) |

Também exercitados na Fase 1: CA-30 (Origin, Host, CSRF, WebSocket), CA-39 (o hook nunca trava), CA-44 (projeto a partir da pasta de trabalho), CA-59 (statusLine no diff), CA-64 (privacidade), CA-71 (pedido de permissão leva o NPC à porta da Diretoria).

## Resultado final do QA da Fase 1

Dos CA-01 a CA-25: **22 cobertos e passando** (no CA-08 só a parte automatizável), **3 parciais com resto manual** (CA-18, CA-20, CA-21) e **0 sem cobertura**. Última execução completa: `npm run check` verde com 474 testes unitários e 205 de integração, e 83 testes de ponta a ponta verdes, sem nenhum teste marcado como "falha esperada". Todos os bugs da rodada de QA estão corrigidos.

Itens manuais ainda pendentes: uma sessão real do Claude Desktop, aplicar o diff do `settings.json`, a atualização da skill `rh-equipe`, uma execução de CPU de 10 minutos e o servidor rodando 8 horas. O desvio de CPU no pior caso (cerca de 17 % contra 10 %) é conhecido e está agendado para a Fase 4, veja [Desempenho](performance.md).

## Relacionado

- [Limitações conhecidas](../explanation/limitations.md)
- [Desempenho medido](performance.md)
