# Referência: contratos de dados

[🇺🇸 English](../../en/reference/contracts.md) · [Índice da documentação](../README.md)

Os contratos são escritos em zod em `src/shared/contracts/` e exportados como JSON Schema em `schemas/` pelo `npm run schemas:gen`. Um teste falha quando os schemas estão desatualizados. O campo `schema` de cada arquivo carrega a versão; acréscimos compatíveis mantêm `v1`, e uma mudança incompatível vira `v2` com migração e um novo ADR ([ADR-0008](../../adr/0008-team-and-map-config-contracts.md)).

| Contrato | Arquivo que descreve | JSON Schema | Escrito por |
|---|---|---|---|
| `escritorio/v1` | `%USERPROFILE%\.claude\equipe\escritorio.json` | [`schemas/escritorio.v1.schema.json`](../../../schemas/escritorio.v1.schema.json) | você, o `team:init`, a skill `rh-equipe` (planejado) |
| `mapa/v1` | `assets\map\mapa.json` | [`schemas/mapa.v1.schema.json`](../../../schemas/mapa.v1.schema.json) | o projeto (convertido da planta) |
| `uso/v1` | `%USERPROFILE%\.claude\equipe\uso.json` | [`schemas/uso.v1.schema.json`](../../../schemas/uso.v1.schema.json) | o script da statusLine (Fase 3) |
| eventos e mensagens WebSocket | em memória | [`schemas/events.v1.schema.json`](../../../schemas/events.v1.schema.json) | o servidor |
| corpos REST | em trânsito | [`schemas/rest.v1.schema.json`](../../../schemas/rest.v1.schema.json) | o servidor |

Regras de leitura: arquivos escritos por outros (`escritorio.json`, payloads de hook, arquivos de sessão, `uso.json`) são lidos de forma tolerante: nunca uma exceção, campos desconhecidos são ignorados, problemas viram diagnósticos. As rotas de ação são o oposto: schemas estritos que rejeitam campos desconhecidos.

## `escritorio/v1`

Objeto raiz:

| Campo | Tipo | Observações |
|---|---|---|
| `schema` | `"escritorio/v1"` | obrigatório |
| `updatedAt` | data-hora ISO | opcional |
| `studio` | `{name (1–40), nameIsProvisional}` | nome do estúdio mostrado na barra superior |
| `departments` | lista, ao menos 1 | `{id, name (1–40), colorToken (dept-…), rooms[] (ids de salas do mapa)}` |
| `agents` | lista, ao menos 1 | veja abaixo |
| `freelancer` | objeto | o visitante mostrado para tipos de agente desconhecidos: `nickname`, `title`, `sprite`, `badge: "visitante"`, `showAgentTypeAsLabel`, `phrases`, `homeRoom` (`REC`) |
| `mascots` | lista, até 4, opcional | `{id, name, species: pomeranian\|golden-retriever, description?, sprite}` (usado a partir da Fase 4) |

Agente:

| Campo | Tipo | Observações |
|---|---|---|
| `agentType` | slug | Único. Igual ao nome do arquivo do agente em `~/.claude/agents/` e ao `agent_type` do hook. |
| `nickname` | 1–24 caracteres | |
| `fullName` | 3–60 caracteres | |
| `title` | 2–60 caracteres | |
| `department` | slug | Precisa existir em `departments`. |
| `desk` | id do mapa ou `null` | ex.: `ENG-02`. `null` significa mesa provisória. |
| `provisional` | booleano | padrão `false` |
| `sprite` | slug | |
| `badge` | `staff` \| `diretoria` | padrão `staff` |
| `isLead` | booleano | exatamente um agente tem `true` (o agente da conversa principal, `chefe`) |
| `since` | data `AAAA-MM-DD` | opcional |
| `personality` | `{traits[1–6], tone (≤160), routineWeights?}` | chaves de `routineWeights`: `coffee`, `copa-chat`, `water`, `window`, `terrace`, `arcade`, `pingpong`, `bathroom`, `library`, `sofa`; valores de 0 a 5 |
| `phrases` | até 50 textos, cada um com 1–120 caracteres | |

Regras dentro do arquivo: `agentType` único, ids de departamento únicos, todo departamento existe, nenhuma mesa atribuída duas vezes, exatamente um líder. Regras contra outros arquivos, verificadas pelo `team:check` e ao carregar: todo agente do `QUADRO.md` tem entrada e vice-versa, a mesa existe no mapa e pertence a uma sala do departamento do agente. Os campos são estritos: campo desconhecido torna o arquivo inválido. Tamanho máximo de 1 MiB.

Em caso de erro, o servidor mantém a última configuração válida e publica um diagnóstico com o arquivo e o campo. Sem nenhum arquivo válido, monta uma equipe de reserva a partir do `QUADRO.md` (todos em mesas provisórias).

A proposta para os 16 agentes é `docs/projeto/2026-11-12-escritorio-equipe/escritorio.proposta.json`.

## `mapa/v1`

Chaves de topo: `schema`, `tileSize` (16), `cols` (64), `rows` (52), `tilesets`, `layers`, `collision`, `rooms`, `doors`, `desks`, `seats`, `pois`, `objects`, `lightZones`, `lights`, `windows`, `boards`, `projectSlots`, `spawn`, `pets`. O andar atual tem 22 salas, 27 mesas, 42 assentos e 22 pontos de interesse. Os ids das salas (`DIR`, `REU`, `PLN`, `ENG`, `QUA`, `SOC`, `PRJ1`–`PRJ4`, `ENT`, `SRV`, `BIB`, `REC`, `WC`, `COP`, `TER`, corredores) vêm de `docs/design/MAPA.md` e nunca mudam. Validação (`src/shared/world/mapValidation.ts`): ids únicos; toda mesa, assento e ponto de interesse num tile caminhável alcançável a partir da porta de entrada; quatro vagas de projeto; todas as salas obrigatórias presentes.

## `uso/v1`

Definido e testado, mas sem uso até a Fase 3. `{schema: "uso/v1", updatedAt, source?, sessionId?, model?, windows: {fiveHour?, sevenDay?}, spendLimit?, extraWindows?}`, onde cada janela é `{usedPercentage, resetsAt (segundos epoch), observedAt?, stale?}`. Percentuais fora da faixa são aceitos pelo leitor e limitados pela interface.

## Códigos de diagnóstico

O servidor publica problemas como diagnósticos (`file`, `path` opcional, `severity`, `code`) e nunca deixa que eles quebrem o escritório. A interface transforma cada `code` numa frase traduzida (23 códigos). Um `escritorio.json` ausente é uma nota tranquila; um inválido é uma faixa de aviso com o nome do campo. Os detalhes nunca incluem conteúdo de arquivos.

| Grupo | Códigos |
|---|---|
| `escritorio.json` | `team.json-invalid`, `team.file-too-large`, `team.field-invalid`, `team.schema-invalid`, `team.agent-duplicate`, `team.desk-duplicate`, `team.department-unknown`, `team.department-duplicate`, `team.lead-count` |
| Contra o mapa e o `QUADRO.md` | `team.desk-missing-in-map`, `team.desk-wrong-room`, `team.room-missing-in-map`, `team.npc-without-agent`, `team.agent-without-npc`, `team.desk-null-not-provisional`, `team.more-issues` (os quatro últimos dividem uma frase genérica) |
| `QUADRO.md` | `quadro.file-missing`, `quadro.no-agents`, `quadro.row-invalid`, `quadro.agent-duplicate`, `quadro.too-many` |
| Mapa e escritório | `map.unreadable`, `office.freelancer-limit` |

Qualquer outro código cai numa frase genérica "Aviso sobre <arquivo>" que aponta para o log do servidor.

## Relacionado

- [Personalizar os NPCs](../how-to/customize-npcs.md)
- [ADR-0008](../../adr/0008-team-and-map-config-contracts.md)
