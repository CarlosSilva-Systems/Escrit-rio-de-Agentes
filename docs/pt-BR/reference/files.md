# Referência: arquivos

[🇺🇸 English](../../en/reference/files.md) · [Índice da documentação](../README.md)

## `%USERPROFILE%\.escritorio-equipe\` (dados de execução)

Criada na primeira partida; mude com `ESCRITORIO_HOME`. Fica fora do OneDrive de propósito. Os arquivos com segredo são restritos ao seu usuário, ao SYSTEM e aos Administradores com `icacls`; se isso falhar, o servidor registra um aviso com o nome do arquivo.

| Caminho | Conteúdo | Segredo |
|---|---|---|
| `token` | Token mestre, 256 bits (43 caracteres base64url). Usado pela CLI para pedir tickets ao servidor e para desligá-lo. Nunca vai ao navegador. | sim |
| `hook-token` | Token de hook, 256 bits. Usado só pelo script do hook para falar com `/api/hooks/v1/claude`. | sim |
| `config.json` | Configurações públicas (lista fechada): `lang` (`pt-BR`/`en`), `sound`, `music`, `quality` (`auto`/`high`/`medium`/`low`), `approvalDeadlineSec` (10–300, padrão 60), `chatMode` (por projeto), `npcWorkPlace` (`desk`/`projectRoom`/`auto`). Gravado pelo `PATCH /api/config` (trocas de idioma e som na interface). Um campo inválido volta ao padrão e um aviso é registrado; o arquivo não é reescrito. `lang` também define o idioma das mensagens da CLI e do servidor. | não |
| `runtime.json` | `{pid, port, startedAt, version}` do servidor em execução. Removido no desligamento normal. | não |
| `sessions.json` | Sessões de navegador como hashes SHA-256 com horários de criação e último uso (nunca o cookie em si). Atrelado à geração do token. | não |
| `bin\` | Scripts do hook copiados pelo `hooks:sync` (`escritorio-hook.cjs`). | não |
| `claude-settings.json` | Configurações entregues às sessões do Claude abertas pelo painel com `--settings` (Fase 2). Gravado pelo `hooks:sync`. | não |
| `logs\` | `escritorio-<data>.log` (guardado por 7 dias), `server-stdout.log` (saída da partida), `hook.log` (só com `ESCRITORIO_HOOK_DEBUG=1`). Tokens, cookies e tickets são ocultados; prompts e dados de ferramentas nunca são logados. | não |
| `cache\` | Reservada para dados derivados; vazia na Fase 1. | não |

Toda gravação é atômica (arquivo temporário e depois renomeação, com novas tentativas no Windows).

## `%USERPROFILE%\.claude\` (dados do Claude Code, lidos pelo escritório)

| Caminho | Quem escreve | Como o escritório usa |
|---|---|---|
| `equipe\QUADRO.md` | A skill `rh-equipe` | Tabela "Equipe ativa": a lista de agentes. Só leitura. |
| `equipe\escritorio.json` | Você (ou o `team:init`) | Quem é quem: nomes, cargos, mesas, frases. Vigiado; veja [Contratos](contracts.md). Ainda não existe. |
| `equipe\uso.json` | O script da statusLine (Fase 3) | Medidor de uso. Não usado na Fase 1. |
| `projects\**\*.jsonl` | O Claude Code | Nível 0: novos arquivos `subagents\agent-<id>.jsonl` e linhas recentes (só ids, nomes de ferramentas e pasta de trabalho). Só leitura; o histórico nunca é reexibido. |
| `settings.json` | Você; o `settings:apply` só com a sua aprovação | Hooks do Nível 1. Um backup `settings.json.bak-<data>-<hora>` é criado antes de qualquer mudança. |

O escritório nunca lê o `.credentials.json` nem qualquer token OAuth.

## No repositório

| Caminho | Conteúdo |
|---|---|
| `assets\map\mapa.json` | O andar do escritório (`mapa/v1`): salas, portas, mesas, assentos, pontos de interesse. |
| `assets\fonts\` | Pixelify Sans e Silkscreen (SIL OFL 1.1) com os textos das licenças. |
| `schemas\*.json` | JSON Schemas gerados dos contratos zod (`npm run schemas:gen`): `escritorio.v1`, `mapa.v1`, `uso.v1`, `events.v1`, `rest.v1`. |
| `src\hook-runtime\escritorio-hook.cjs` | Código-fonte do hook (Node puro, sem dependências, sem build). |
| `scripts\abrir-escritorio-dev.bat` | Atalho de desenvolvimento: compila se `dist` não existir e depois roda `open`. |
| `dist\` | Saída da compilação: `web\`, `server\index.js`, `cli.js`. Não versionada. |
| `docs\projeto\2026-11-12-escritorio-equipe\` | Plano interno do projeto, requisitos, relatórios de QA. |
| `CREDITS.md`, `NOTICE.md` (e `.pt-BR`) | Créditos de terceiros e atribuição ao Pixel Agents. |

## Relacionado

- [Variáveis de ambiente](environment.md)
- [Modelo de segurança local](../explanation/security.md)
