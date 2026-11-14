# Como ver um novo contratado chegar ao escritório

[🇺🇸 English](../../en/how-to/see-new-hires.md) · [Índice da documentação](../README.md)

Objetivo: quando um agente novo entra na equipe (ou sai), ver o escritório reagir.

## O que você vai ver

- **Contratação:** o novo NPC entra pela porta da Recepção até a mesa dele, e um aviso diz "Novo na equipe: <nome>". A mesa é uma mesa livre do departamento certo; sem mesa livre, uma mesa provisória na Recepção e o aviso "<nome> ficou numa mesa provisória na Recepção: não há mesa livre no departamento."
- **Desligamento:** o NPC faz uma pequena cena de despedida e um aviso diz "<nome> saiu da equipe".
- **Tipos de agente desconhecidos** (por exemplo `general-purpose`, ou um contratado que ainda não está no `escritorio.json`) aparecem como um **Freelancer** temporário, com crachá de visitante. Quando o tipo é acrescentado ao arquivo da equipe, o Freelancer é trocado pelo NPC de verdade sem recarregar.

## Passos

1. Deixe o escritório aberto no navegador.
2. Acrescente (ou remova) a entrada do agente em `%USERPROFILE%\.claude\equipe\escritorio.json`, seguindo [Personalizar os NPCs](customize-npcs.md). Use o id de uma mesa livre, por exemplo uma das vagas `<SALA>-V1`.
3. Salve o arquivo. Em instantes a cena de boas-vindas (ou de despedida) acontece.
4. Rode `npm run team:check` para confirmar que `QUADRO.md`, `escritorio.json` e o mapa estão de acordo.

## Limitação atual

A skill `rh-equipe` (que contrata, ajusta e desliga agentes) **ainda não edita o `escritorio.json`**. Ela será atualizada depois que você aprovar a lista de nomes (gate G1), para que toda contratação também acrescente a entrada e rode o `team:check`. Até lá, edite o arquivo à mão, como acima.

## Relacionado

- [Personalizar os NPCs](customize-npcs.md)
- [Limitações conhecidas](../explanation/limitations.md)
