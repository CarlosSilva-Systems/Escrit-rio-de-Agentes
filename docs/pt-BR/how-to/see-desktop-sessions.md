# Como ver sessões do Claude Desktop no escritório

[🇺🇸 English](../../en/how-to/see-desktop-sessions.md) · [Índice da documentação](../README.md)

Objetivo: fazer os agentes chamados pelo Claude Desktop (ou por qualquer terminal) aparecerem como NPCs que começam a trabalhar.

> **Situação hoje: nada foi aplicado ao seu `~/.claude/settings.json`.** O Nível 0 funciona sozinho. O Nível 1 é uma mudança que você aprova e aplica, e que pode ser desfeita. O diff exato proposto está em `docs/projeto/2026-11-12-escritorio-equipe/DIFF-settings-nivel1.md`.

## Nível 0 ou Nível 1?

| | Nível 0 (padrão) | Nível 1 (recomendado) |
|---|---|---|
| Muda o `settings.json` | Não | Sim, de forma aditiva, com backup |
| Como o escritório fica sabendo | Lê os arquivos de sessão em `%USERPROFILE%\.claude\projects` | O Claude Code roda nosso hook pequeno a cada evento |
| Atraso | cerca de 1–2 s | cerca de 0,14 s (p95 medido) |
| Aprovações pelo painel | Não | Preparado para a Fase 2 |
| Sessões abertas pelo painel (Fase 2) | Os hooks vão por `--settings` | Igual |

Se o escritório não vê nenhum evento e o Nível 1 não está instalado, aparece o aviso "Sessões do Claude Desktop não detectadas". Ele é discreto e pode ser dispensado.

## Usar o Nível 0

Não há nada a fazer: ele está sempre ligado enquanto o servidor roda. Só acompanha arquivos que tiveram atividade recente e nunca reexibe o histórico antigo. Se os dados do Claude ficam em outro lugar, defina `ESCRITORIO_CLAUDE_HOME` (veja a [referência de variáveis de ambiente](../reference/environment.md)).

## Instalar o Nível 1

Faça num terminal, na pasta do projeto, com um `npm run build` bem-sucedido antes.

1. Copie o script do hook para a pasta de execução. Isto não toca no `settings.json`:

   ```
   npm run hooks:sync
   ```

   Saída: `Copiado para <você>\.escritorio-equipe\bin: escritorio-hook.cjs (versão do hook: …)`, mais o local do `claude-settings.json` do painel.
2. Veja a mudança proposta. Isto só lê o seu `settings.json` e não grava nada:

   ```
   npm run settings:diff -- --level 1
   ```

   Você recebe um resumo (`Eventos de hook a acrescentar (13): SessionStart, SessionEnd, …`) e um diff unificado. Os grupos existentes, inclusive os do Pixel Agents instalado, ficam intactos; os nossos entram depois deles. Nada é removido.
3. Ensaio opcional numa cópia do arquivo: copie o seu `settings.json` para outro lugar, rode `npm run settings:apply -- --level 1 --settings-file <cópia> --confirm APLICAR` e inspecione a cópia.
4. Aplique de verdade, **só depois de ler e aprovar o diff**:

   ```
   npm run settings:apply -- --level 1 --i-am-carlo-and-approved
   ```

   - O comando exige um **terminal interativo** e pergunta `Digite APLICAR para aplicar:`. Você mesmo precisa digitar a palavra `APLICAR`.
   - No `settings.json` real a opção `--confirm` é ignorada e uma execução não interativa (script, tarefa agendada, entrada redirecionada) é recusada. É de propósito: nenhum programa pode aprovar a mudança por você.
   - Sem `--i-am-carlo-and-approved` o arquivo real é recusado.
   - Antes de gravar, ele salva `settings.json.bak-<data>-<hora>` ao lado do arquivo e valida o JSON depois (restaurando o original se a validação falhar). Mostra `Aplicado. Backup: <caminho>`.
5. Confira: abra uma sessão do Claude que chame um agente. O NPC começa a trabalhar em cerca de um segundo.

## Desfazer

```
npm run settings:revert -- --i-am-carlo-and-approved
```

Também exige terminal interativo e `APLICAR`. Remove só as entradas que contêm o marcador `.escritorio-equipe` e restaura os bytes originais quando o backup ainda confere.

## Sobre o Nível 2

O `--level 2` (envolver a statusLine para alimentar o medidor de uso) é da Fase 3 e o script dele (`escritorio-statusline.cjs`) ainda não existe. Não aplique.

## O que o hook envia

Só nomes de eventos e identificadores (sessão, tipo e id do agente, nome da ferramenta, pasta). Nunca prompts, respostas, entradas ou saídas de ferramentas. Ele sempre sai com código 0 e nunca trava o Claude Code. Na Fase 1 ele só observa; nunca decide nada.

## Relacionado

- [Solução de problemas](troubleshooting.md)
- [Privacidade e custo zero de tokens](../explanation/privacy-and-cost.md)
- [Referência da CLI](../reference/cli.md)
