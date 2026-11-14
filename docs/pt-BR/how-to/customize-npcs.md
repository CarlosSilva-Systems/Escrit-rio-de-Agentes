# Como personalizar os NPCs e o `escritorio.json`

[🇺🇸 English](../../en/how-to/customize-npcs.md) · [Índice da documentação](../README.md)

Objetivo: mudar quem senta onde, nomes, cargos e frases, ou criar o arquivo da equipe pela primeira vez. Os detalhes dos campos estão na [referência de contratos](../reference/contracts.md).

## Antes de começar

- O arquivo fica em `%USERPROFILE%\.claude\equipe\escritorio.json` (esquema `escritorio/v1`).
- **Ele ainda não existe.** A regra do projeto é criá-lo só depois que você aprovar a lista de nomes (gate G1, veja `docs/projeto/2026-11-12-escritorio-equipe/PROPOSTA-NOMES.md`). Até lá o escritório mostra uma equipe deduzida do `QUADRO.md` e um aviso.
- A compilação precisa existir (`npm run build`), porque os comandos abaixo usam a CLI compilada.

## Criar o arquivo a partir da proposta aprovada

1. Revise `docs/projeto/2026-11-12-escritorio-equipe/escritorio.proposta.json` e, se quiser, ajuste nomes, cargos ou frases ali.
2. Confira com o `QUADRO.md` e o mapa, sem gravar nada:

   ```
   npm run team:check -- --escritorio docs/projeto/2026-11-12-escritorio-equipe/escritorio.proposta.json
   ```

   Esperado: `OK: equipe consistente.` e código de saída 0.
3. Grave o arquivo de verdade. O comando se recusa a rodar sem a confirmação explícita:

   ```
   npm run team:init -- --confirm-approved
   ```

   Ele mostra `Gravado: <caminho>`. Se o destino já existir, nada muda, a menos que você acrescente `--overwrite`, que antes salva um backup ao lado (`escritorio.json.bak-<data>`).
4. Rode `npm run team:check` de novo, agora sem opções. Ele compara o `escritorio.json` real, o `QUADRO.md` e o `assets/map/mapa.json`.

## Alterar um agente existente

1. Abra `%USERPROFILE%\.claude\equipe\escritorio.json` num editor.
2. Edite a entrada do agente. Mantenha `agentType` igual ao nome do arquivo do agente em `~/.claude/agents/` (é também o `agent_type` que o Claude Code envia). Campos úteis:
   - `nickname` (até 24 caracteres), `fullName`, `title`.
   - `desk`: um id de mesa do mapa, como `ENG-02`. Ele precisa existir em `assets/map/mapa.json` e pertencer a uma sala do departamento do agente.
   - `phrases`: até 50 frases de até 120 caracteres.
3. Salve. O servidor vigia o arquivo: o escritório se atualiza em instantes, sem recarregar a página.
4. Rode `npm run team:check`. Corrija cada `ERRO` e `AVISO` listado.

## Dar uma mesa provisória a um agente

Se o departamento não tem mesa livre, use `"desk": null` e `"provisional": true`. O NPC fica numa mesa provisória na Recepção e o painel mostra um aviso.

## Se você errar

Um arquivo inválido nunca derruba o escritório. O servidor mantém a última equipe válida e um aviso nomeia o arquivo e o campo (por exemplo `Problema em escritorio.json · agents: …. Mantendo a última configuração válida.`). Corrija o campo e salve de novo: o arquivo é relido sozinho.

## Relacionado

- [Referência de contratos](../reference/contracts.md)
- [Ver um novo contratado chegar](see-new-hires.md)
- [Referência da CLI: `team:check`, `team:init`](../reference/cli.md)
