# Referência: linha de comando

[🇺🇸 English](../../en/reference/cli.md) · [Índice da documentação](../README.md)

O comando `escritorio` é o arquivo compilado `dist/cli.js` (rode `npm run build` antes). Execute como `node dist/cli.js <comando>` na pasta do projeto. Alguns comandos também têm script npm.

As mensagens saem no idioma salvo como `lang` no `config.json` (`pt-BR` por padrão). Rodar sem comando mostra o uso e sai com 0; um comando desconhecido sai com 1.

## Ciclo de vida do servidor

| Comando | Script npm | O que faz |
|---|---|---|
| `start` | — | Liga o servidor em segundo plano (janela oculta, saída em `logs\server-stdout.log`) se ele não estiver rodando. Idempotente: se um servidor saudável responde na porta, não liga nada. Espera até 20 s ele ficar saudável. |
| `open [--no-browser]` | `npm run open` | Liga se preciso, pede ao servidor um ticket de uso único de 60 s e abre `http://127.0.0.1:<porta>/auth/callback?ticket=…` no navegador padrão. Com `--no-browser` (ou `ESCRITORIO_NO_BROWSER=1`) mostra essa URL de uso único em vez de abrir. |
| `stop` | — | Pede ao servidor um desligamento educado (espera até 10 s). Se ele não responder, mata o PID do `runtime.json` apenas se esse PID for o dono da porta. Se nada estiver rodando, mostra "não está ligado" e sai com 0. |
| `status` | — | Mostra `Ligado: http://127.0.0.1:<porta> · PID <pid> · versão <versão>` e sai com 0, ou "não está ligado" e sai com 1. |
| `token:rotate` | — | Novos tokens mestre e de hook; apaga as sessões de navegador salvas. Veja [Girar o token de acesso](../how-to/rotate-token.md). |

O servidor sozinho, em primeiro plano: `npm start` (`node dist/server/index.js`).

## Equipe

| Comando | Script npm | Opções |
|---|---|---|
| `team:check` | `npm run team:check` | `--quadro <arquivo>` (padrão `%USERPROFILE%\.claude\equipe\QUADRO.md`), `--escritorio <arquivo>` (padrão `%USERPROFILE%\.claude\equipe\escritorio.json`), `--mapa <arquivo>` (padrão `assets\map\mapa.json`, relativo à pasta atual), `--lang pt-BR\|en` |
| `team:init` | `npm run team:init` | `--confirm-approved` (obrigatória), `--proposal <arquivo>` (padrão `docs\projeto\2026-11-12-escritorio-equipe\escritorio.proposta.json`), `--dest <arquivo>` (padrão `%USERPROFILE%\.claude\equipe\escritorio.json`), `--overwrite` (antes salva `<destino>.bak-<data>`), `--lang pt-BR\|en` |

O `team:check` compara `QUADRO.md`, `escritorio.json` e o mapa: todo agente tem um NPC e vice-versa, um só líder, agentes e mesas únicos, mesas existem no mapa e pertencem a uma sala do departamento do agente. Sem o arquivo do mapa, as checagens de mesa e sala são puladas (com aviso); com um `--mapa` explícito que não existe, o comando falha.

O `team:init` grava a proposta como `escritorio.json` só depois da confirmação e da validação, de forma atômica.

## Configurações do Claude Code

| Comando | Script npm | Opções |
|---|---|---|
| `settings:diff` | `npm run settings:diff` | `--level 1\|2` (padrão 1), `--settings-file <arquivo>` (padrão `%USERPROFILE%\.claude\settings.json`). Não grava nada. |
| `settings:apply` | `npm run settings:apply` | `--level 1\|2` (obrigatória), `--confirm APLICAR` (só para arquivos que não sejam o real), `--settings-file <arquivo>`, `--i-am-carlo-and-approved` (obrigatória para o arquivo real) |
| `settings:revert` | `npm run settings:revert` | `--settings-file <arquivo>`, `--i-am-carlo-and-approved` (obrigatória para o arquivo real) |
| `hooks:sync` | `npm run hooks:sync` | `--settings-file <arquivo>` |

- **Nível 1**: acrescenta o hook do Escritório (`escritorio-hook.cjs`) a 13 eventos, ao lado dos existentes (11 eventos que já existem mais `UserPromptSubmit` e `TaskCreated`). **Nível 2** (Fase 3): envolve a statusLine; o script dele ainda não existe.
- No `settings.json` real, `apply` e `revert` exigem um terminal interativo em que você digita `APLICAR`; `--confirm` é ignorado ali. A pasta dos scripts precisa ter `.escritorio-equipe` no caminho (é assim que o `revert` reconhece o que é nosso).
- `hooks:sync` copia `src/hook-runtime/*` para `%USERPROFILE%\.escritorio-equipe\bin` e grava o `claude-settings.json` do painel. Nunca toca no `settings.json`.

Procedimento: [Ver sessões do Claude Desktop](../how-to/see-desktop-sessions.md).

## Códigos de saída

| Comando | Código | Significado |
|---|---|---|
| qualquer | `0` | Sucesso |
| qualquer | `1` | Falha: comando desconhecido, ambiente inválido, erro do comando, `status` sem servidor |
| `settings:*`, `hooks:sync` | `2` | Erro de uso (opção desconhecida ou sem valor, `--level` inválido ou ausente) |
| `team:check` | `1` | Inconsistências encontradas (erros ou avisos) |
| `team:check` | `2` | Arquivo obrigatório ausente ou ilegível, ou erro de uso |
| `team:init` | `1` | Proposta inválida, ou destino existe sem `--overwrite` |
| `team:init` | `2` | Falta `--confirm-approved`, proposta não encontrada, ou erro de uso |
| servidor (`npm start`) | `3` | Porta já em uso |
| servidor (`npm start`) | `4` | Não foi possível abrir a porta por outro motivo |

## Relacionado

- [Variáveis de ambiente](environment.md)
- [Solução de problemas](../how-to/troubleshooting.md)
