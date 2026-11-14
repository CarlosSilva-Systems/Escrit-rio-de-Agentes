# S-05 — Spike JSONL: `usage`, dedupe, `.meta.json` de subagentes e `cwd`

> Autor: Bruno (dev-backend) · Data: 2026-11-13 · Status: concluído · Cobre: CA-63, CA-64, CA-18, CA-44 · Alimenta: T-19, T-42, T-67 (ADR-0006)

## Método e privacidade

- Foram analisados **apenas metadados/estrutura** de 2 transcrições locais de `~/.claude/projects/` (uma sessão com 14 subagentes e outra sem) com `spikes/jsonl/inspect.mjs`, que imprime nomes de chaves, tipos JS, contagens e contadores numéricos de `usage`.
- O inspetor **nunca imprime valores de texto** (prompts, respostas, caminhos, entradas/saídas de ferramentas). Nenhum conteúdo de conversa, caminho real ou `description` de subagente foi copiado para arquivo ou para este relatório.
- As fixtures de teste (`tests/fixtures/jsonl/**`) são **sintéticas**, geradas por `spikes/jsonl/gen-fixtures.mjs`, com totais conhecidos em `expected.json` e "canários" (`CANARY-…`) que os testes exigem que nunca apareçam em nenhuma saída.

## Achados (formato observado, Claude Code atual)

| Tema | Achado |
|---|---|
| Linha | Um objeto JSON por linha. Chaves de topo variam muito por `type` (assistant, user, system, attachment, queue-operation, file-history-snapshot, custom-title, agent-name, last-prompt, …): o parser precisa ser tolerante a tipos desconhecidos. |
| Linhas com `usage` | Só `type:"assistant"`, em `message.usage` com `input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens` (números) e extras (`cache_creation{}`, `service_tier`, `iterations[]`, `server_tool_use{}`…). Os 4 contadores existiam em 100 % das linhas amostradas. |
| Ids | `message.id` (`msg_…`) e `requestId` (`req_…`) presentes em 100 % das linhas de assistente amostradas; sempre 1:1 entre si. |
| **Repetição** | Cada bloco de conteúdo de uma resposta (thinking, text, cada tool_use) é gravado como **uma linha própria, com o mesmo `message.id`, o mesmo `requestId` e o mesmo `usage`**. Sessão principal: 103 linhas com usage = 43 `message.id` distintos (25 repetidos). Subagente: 22 linhas = 10 ids. Outra sessão: 60 linhas = 32 ids. |
| Impacto | Somar todas as linhas **infla** os totais ≈ 2,2× (ex.: saída 269 389 ingênua × 68 245 deduplicada; cache_read 16,5 M × 7,4 M). |
| Divergência entre repetições | Nas amostras, o `usage` das linhas repetidas foi **idêntico** (0 divergências). Como versões com streaming parcial podem gravar `output_tokens` crescente, a regra usa o **máximo por contador** (cobre os dois casos). |
| Ids entre arquivos | 0 `message.id` do arquivo principal repetido nos 14 arquivos de subagente (237 ids): dedupe pode ser **por arquivo**. |
| Subagentes | `<slug-do-projeto>/<sessionId>/subagents/agent-<id>.jsonl` + `agent-<id>.meta.json` (+ `agent-<id>.prefix.json`, ignorável). Nas linhas do subagente: `agentId` (= nome do arquivo sem `agent-`, 14/14), `isSidechain:true`, `sessionId` = sessão pai (14/14), `cwd`. |
| `.meta.json` | Chaves: `agentType` (= `name` do agente = `agent_type` do hook), `isBuiltIn`, `launchedWithDefaults`, `description` (**resumo da tarefa: tratar como sensível, não extrair**), `toolUseId`, `spawnDepth`, `requestShape`, `requestNonInteractive`, `pickedEffortModel` e, **ao terminar, `finished:true`**. |
| `cwd` | Presente em ~40–70 % das linhas (user/assistant/system), `string`, **um único valor distinto por arquivo** nas amostras, aparece já nas primeiras linhas. A pasta-slug (`C--Users-…`) é ambígua (hífens), então o `cwd` é a fonte. |

## Regra de dedupe (adotada em `src/server/jsonl/usage.ts`)

1. Considerar só linhas `type:"assistant"` com `message.usage` (contadores inválidos/negativos/texto → 0).
2. Chave = `message.id`; se ausente, `requestId`; se ausente, `uuid` da linha; sem nenhuma chave, a linha conta uma vez (e é contada em `withoutKey`).
3. Por chave guardar o **máximo de cada contador**; o que entra no agregado é só o **acréscimo** sobre o já visto (funciona na leitura incremental, entre polls).
4. Escopo = **um arquivo** (principal ou subagente), mapa limitado a 50 000 chaves (repetições são linhas vizinhas, então despejar as mais antigas é seguro).
5. Truncamento/substituição do arquivo zera o deduper daquele arquivo (o conteúdo recomeçou).

Atribuição (T-67): projeto = `cwdToProject(cwd, devRoot)`; agente = `agentType` do `.meta.json` irmão para arquivos de subagente, senão `chefe`; sem `.meta.json` (ou `agentType` inválido) o subagente é tratado como desconhecido (Freelancer a montante).

## Regras de `cwd` → projeto (`src/server/jsonl/project.ts`)

Primeiro nível sob a raiz DEV (comparação sem diferenciar maiúsculas, aceita `/`, `\` e prefixo `\\?\`) vira `{kind:"dev", name}` desde que o nome passe em `validateProjectName`; pasta de 1º nível inválida (8.3 `~`, nome reservado) e qualquer caminho fora da raiz (inclusive prefixo-irmão `7 - DEV-old`, `..`, UNC) viram `{kind:"outside", basename}` (**só o nome da pasta**, CA-44); a própria raiz ou `cwd` ausente = `unknown`.

## Fixtures sintéticas e totais conhecidos

`tests/fixtures/jsonl/expected.json`: sessão principal = entrada 42 · saída 390 · cache_read 3 570 · cache_creation 82 (ingênuo seria 89/800/7 640/189); 2 linhas ignoradas (JSON truncado e `[1,2,3]`); subagentes `dev-web` (7/70/700/7), `general-purpose` (1/10/100/1) e sem meta (2/20/200/2); total geral 52/490/4 570/92. Cobrem: bloco repetido, `usage` parcial crescente (10→40), linha só com `requestId`, contadores corrompidos, tipo desconhecido, linha em branco.

## Consequências para as próximas tarefas

- **T-19/T-42** (ligar ao EventBus): usar `JsonlIngestor` por arquivo; `subagent.start` = primeiro aparecimento de `agent-<id>.jsonl`; `subagent.stop` = `finished:true` no `.meta.json` **ou** 120 s sem escrita (o `finished` é mais rápido e determinístico: preferir).
- **T-67**: persistir somente os offsets (`JsonlTailer.snapshot()`) e agregados; os offsets não contêm texto.
- **Risco**: formato interno pode mudar (RT-07): manter o contador "N linhas ignoradas" e refazer o inspetor a cada versão do Claude Code.
- **Limites conhecidos**: uma última linha sem `\n` só é entregue quando o `\n` chegar; `attachAtEnd` pode começar no meio de uma linha (vira 1 linha ignorada).
