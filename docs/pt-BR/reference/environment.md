# Referência: variáveis de ambiente

[🇺🇸 English](../../en/reference/environment.md) · [Índice da documentação](../README.md)

Nenhuma delas é segredo: os tokens ficam em arquivos (veja [Arquivos](files.md)). Defina-as no shell que roda o comando (PowerShell: `$env:NOME = "valor"`). O servidor e a CLI **não** leem um arquivo `.env`; o `.env.example` só documenta os nomes. Valor vazio conta como "não definida". Um valor inválido encerra o programa com `Configuração de ambiente inválida: <motivo>` (código de saída 1).

Propositalmente **não existe variável para o endereço de rede**: o servidor sempre escuta em `127.0.0.1`.

| Nome | Obrigatória | Padrão | Lida por | Descrição |
|---|---|---|---|---|
| `ESCRITORIO_PORT` | não | `3200` | servidor, CLI | Porta de loopback, inteiro de 1 a 65535. Se estiver ocupada, o servidor sai com código 3; nunca escolhe outra porta. |
| `ESCRITORIO_HOME` | não | `%USERPROFILE%\.escritorio-equipe` | servidor, CLI, hook | Pasta de tokens, estado, cache, logs e scripts do hook. |
| `ESCRITORIO_DEV_ROOT` | não | a primeira que existir entre `%OneDrive%\Documentos\7 - DEV`, `%OneDrive%\Documents\7 - DEV`, `%USERPROFILE%\Documents\7 - DEV`, `%USERPROFILE%\Documentos\7 - DEV`; senão `%USERPROFILE%\Documents\7 - DEV` | servidor | Pasta raiz cujas subpastas de primeiro nível são os projetos. A pasta de trabalho de uma sessão dentro dela dá nome ao projeto no escritório. |
| `ESCRITORIO_LOG_LEVEL` | não | `info` | servidor | `trace`, `debug`, `info`, `warn` ou `error`. |
| `CLAUDE_BIN` | não | resolvido pelo `PATH` (só `.exe`) | servidor | Caminho absoluto do `claude.exe`. Reservada ao chat (Fase 2); a Fase 1 nunca executa o `claude`. |
| `ESCRITORIO_CLAUDE_HOME` | não | `%USERPROFILE%\.claude` | servidor | Onde ficam os dados do Claude Code. O servidor lê daqui `projects\` (arquivos de sessão do Nível 0) e `equipe\` (`QUADRO.md`, `escritorio.json`). Serve sobretudo para testes e instalações fora do padrão. |
| `ESCRITORIO_NO_BROWSER` | não | não definida | CLI (`open`) | `1` faz o `open` mostrar a URL de uso único em vez de abrir o navegador. |
| `ESCRITORIO_HOOK_DEBUG` | não | não definida | script do hook | `1` faz o hook gravar metadados de tempo (nome do evento, id da sessão, milissegundos, status; nunca conteúdo) em `logs\hook.log`. |

O `escritorio.json` e o `QUADRO.md` ficam normalmente em `%USERPROFILE%\.claude\equipe\`; os comandos `team:*` sempre usam essa pasta, independentemente de `ESCRITORIO_CLAUDE_HOME`, a menos que você passe `--quadro` / `--escritorio`.

## Relacionado

- [Referência de arquivos](files.md)
- [Referência da CLI](cli.md)
