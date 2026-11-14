# Proposta de nomes, cargos e mesas — para aprovação do Carlos (PA-01, gate G1)

> Autor: Artur · 2026-11-12 · Dados completos (personalidade, tom, 5 frases por agente, mascotes): `escritorio.proposta.json` · Esquema: `escritorio.schema.json` (`escritorio/v1`).
> **Nada foi criado em `~/.claude/equipe/`.** Depois da sua aprovação (com ajustes), a tarefa T-31 gera o `escritorio.json` definitivo com `npm run team:init`.
> Apelidos do QUADRO mantidos. Mesas usam os **ids do `docs/design/MAPA.md` §6** da Bianca (ex.: `PLN-02`); as coordenadas ficam só no mapa.

## Equipe

| # | Nome técnico (`agent_type`) | Apelido | Nome completo | Cargo | Departamento (cor) | Mesa | Personalidade | Frase exemplo |
|---|---|---|---|---|---|---|---|---|
| 1 | `chefe` | **Henrique** ("o Diretor") | Henrique Bastos Albuquerque | **Diretor de Projetos** | Diretoria (dourado) | `DIR-00` | calmo, organizado, decidido | "Sem teste passando não é pronto, é quase." |
| 2 | `analista` | Alice | Alice Monteiro Ramos | Analista de Requisitos Sênior | Planejamento (lilás) | `PLN-01` (quadro de post-its) | curiosa, detalhista | "Dado, quando, então. Sempre." |
| 3 | `arquiteto` | Artur | Artur Vasconcelos Prado | Arquiteto de Software | Planejamento | `PLN-02` (prancheta, plantas) | ponderado, pragmático | "Isso merece um ADR." |
| 4 | `designer-ux` | Bianca | Bianca Toledo Nakamura | Designer de UX/UI | Planejamento | `PLN-03` (tablet, paleta) | criativa, acessibilidade | "Contraste 4,5 para 1, nem um pixel a menos." |
| 5 | `dev-web` | Lívia | Lívia Carvalho Mendes | Desenvolvedora Front-end | Engenharia (azul) | `ENG-01` | rápida, bem-humorada | "Build verde! Alguém quer café?" |
| 6 | `dev-backend` | Bruno | Bruno Siqueira Fontes | Desenvolvedor Back-end | Engenharia | `ENG-02` | metódico, tranquilo | "Os logs não mentem." |
| 7 | `dev-odoo` | Otávio | Otávio Brandão Leite | Desenvolvedor Odoo (padrão OCA) | Engenharia | `ENG-03` (caneca roxa) | paciente, fiel à OCA | "Herança, não cópia. Sempre herança." |
| 8 | `dev-embarcados` | Eduardo | Eduardo Pacheco Nunes | Engenheiro de Sistemas Embarcados | Engenharia | `ENG-04` (bancada, protoboard) | engenhoso, cuidadoso | "O osciloscópio não mente." |
| 9 | `dev-automacao` | Rafael | Rafael Moura Teixeira | Engenheiro de Automação Industrial | Engenharia | `ENG-05` (painel, CLP) | prudente, segurança primeiro | "Primeiro o estado seguro, depois o resto." |
| 10 | `testador-qa` | Teresa | Teresa Almeida Couto | Analista de Qualidade (QA) | Qualidade e Segurança (verde) | `QUA-01` (lupa, quadro de bugs) | persistente, adora bugs | "Achei um bug. Digo, uma oportunidade." |
| 11 | `revisor-codigo` | Rita | Rita Figueiredo Sales | Revisora de Código | Qualidade e Segurança | `QUA-02` (pilha de PRs) | criteriosa, justa | "Sugestão, não bloqueante. Mas pense nela." |
| 12 | `revisor-seguranca` | Sérgio | Sérgio Rezende Matos | Especialista em Segurança de Aplicações | Qualidade e Segurança | `SOC-01` (sala SOC) | sério, discreto | "Nada de token na URL." |
| 13 | `pentester` | Pedro | Pedro Galvão Rocha | Analista de Testes de Intrusão (Pentester) | Qualidade e Segurança | `SOC-02` (sala SOC) | brincalhão, pensa como atacante | "E se eu mandar um ../../ aqui?" |
| 14 | `git-github` | Gabriela | Gabriela Freitas Andrade | Engenheira de Versionamento e Releases | Entrega (laranja) | `ENT-01` (quadro de branches) | organizada, firme | "Commit atômico ou nada." |
| 15 | `documentador` | Davi | Davi Coutinho Barros | Redator Técnico | Entrega | `ENT-02` (máquina de escrever) | calmo, bilíngue | "Link quebrado? Não no meu turno." |
| 16 | `pesquisador` | Paula | Paula Rios Medeiros | Pesquisadora Técnica | Biblioteca (vinho) | `BIB-01` | rigorosa com fontes | "Fonte e data, por favor." |

Observações:
- **Diretor:** o nome "Henrique" é sugestão; nas frases dos NPCs ele é chamado de "o Diretor". Troque à vontade.
- Sérgio e Pedro são do departamento Qualidade e Segurança (id `qualidade`, verde), mas sentam na **Sala SOC**; Teresa e Rita na sala **Qualidade**. Vagas livres para contratações: `PLN-V1`, `ENG-V1…V3`, `QUA-V1/V2`, `SOC-V1`, `ENT-V1`, `BIB-V1` (MAPA.md).
- **Nome do estúdio** (PA-20): provisório "Estúdio do Carlos" (`nameIsProvisional: true`). Qual nome você quer?
- **Mascotes** (sugestão): **Paçoca** (Lulu da Pomerânia laranja) e **Biscoito** (filhote de golden retriever).

## Freelancer (agent_type desconhecido)
Regra (CA-17): qualquer `agent_type` que não esteja em `agents[]` (ex.: `general-purpose`, ou um contratado ainda não configurado) vira uma instância temporária **Freelancer** por `agent_id`: crachá de visitante, chega pela Recepção (`homeRoom: REC`), trabalha numa mesa provisória `FL-D1`/`FL-D2` (ou espera no sofá `FL-S1/S2`) e vai embora 5 s após o `SubagentStop`. O rótulo mostra o `agent_type` (até 24 caracteres, como texto). Se o tipo for adicionado ao `escritorio.json`, o Freelancer é trocado pelo NPC real sem recarregar.

## Esquema `escritorio/v1` (resumo)
- Raiz: `schema` = `"escritorio/v1"` (obrigatório), `updatedAt`, `studio {name, nameIsProvisional}`, `departments[] {id, name, colorToken (= tokens.css da Bianca, ex.: dept-qualidade), rooms[] (ids do mapa, ex.: QUA, SOC)}`, `agents[]`, `freelancer {nickname, title, homeRoom, sprite, badge, phrases}`, `mascots[]`.
- Agente: `agentType` (= `name` do arquivo do agente = `agent_type` dos hooks, único), `nickname`, `fullName`, `title`, `department`, `desk` (id do mapa, ex.: `ENG-02`, ou `null` + `provisional:true` → mesa provisória `FL-D1/FL-D2` na Recepção), `sprite`, `badge`, `isLead` (só o chefe), `since`, `personality {traits[], tone, routineWeights{coffee, copa-chat, water, window, terrace, arcade, pingpong, bathroom, library, sofa}}`, `phrases[]` (≤50, cada uma ≤120 caracteres).
- Regras entre arquivos: tipos únicos; departamento existe; mesa existe no `mapa.json` e pertence a uma sala do departamento; nenhuma mesa repetida; exatamente um `isLead`; todo agente da tabela "Equipe ativa" do QUADRO.md tem entrada (`npm run team:check`).
- Evolução: mudanças aditivas mantêm `v1`; mudança incompatível → `v2` + migração + ADR (ADR-0008).
- Validação feita em 2026-11-12: a proposta passa nas regras do esquema e cobre exatamente os 16 arquivos de `~/.claude/agents/`.

## Como a skill rh-equipe passará a manter o arquivo (T-29)
- **Contratar:** acrescenta um item em `agents[]` com a primeira vaga livre `<SALA>-Vn` do departamento (lista do `mapa.json`); sem mesa livre → `desk: null, provisional: true` (mesa provisória na Recepção + aviso no painel). O painel mostra a cena de boas-vindas.
- **Ajustar:** edita cargo/frases/personalidade; não muda `agentType`.
- **Desligar:** remove o item (cena simples de despedida), depois de confirmado pelo Carlos, como hoje.
- Sempre roda `npm run team:check` (consistência com o QUADRO.md).

## Para aprovar
1. Nomes completos e cargos (pode trocar qualquer um).
2. Nome do Diretor.
3. Nome do estúdio.
4. Nomes dos mascotes.
