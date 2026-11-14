# Escritório da Equipe

Um painel web local em pixel art onde uma equipe de agentes do Claude Code "mora": cada agente é um NPC numa mesa e começa a trabalhar quando o Claude Code chama aquele agente. Feito para um único usuário, no Windows 11.

[🇺🇸 English](README.md)

> **Só local.** O servidor escuta em `127.0.0.1:3200` e em mais nenhum lugar. Não existe opção para expor na rede, e não vai existir.

## Funcionalidades

Estado atual: **Fase 1 de 5 (Fundação)**. Versão `0.1.0`.

O que já funciona:

- Um andar de escritório em pixel art (64×52 tiles) com todas as salas fixas e quatro salas de projeto vagas.
- Um NPC por agente do `QUADRO.md` (16 hoje), com nome, cargo, departamento e status ao vivo: parado, trabalhando ou aguardando aprovação.
- Agentes chamados pelo Claude Code começam a trabalhar em cerca de 140 ms (hooks) ou 1–2 s (leitura dos arquivos de sessão). Tipos de agente desconhecidos viram "Freelancers" visitantes temporários.
- Cartão ao passar o mouse, painel ao clicar com a atividade recente, gaveta da Equipe, minimapa, zoom, arrastar e "seguir este NPC".
- Interface em português (padrão) e inglês, trocável sem recarregar; atalhos de teclado; respeita `prefers-reduced-motion`.
- Acesso seguro (ticket de uso único, cookie de sessão, CSRF) e a linha de comando `escritorio` (`open`, `start`, `stop`, `status`, `token:rotate`, `settings:*`, `hooks:sync`, `team:*`).
- Um instalador dos hooks do Claude Code que você pode revisar e desfazer (`settings:diff` / `settings:apply` / `settings:revert`). **Nada foi aplicado ao seu `settings.json`.**

O que **ainda não** funciona (os painéis C, T, A e M abrem um aviso "esta área chega nas próximas etapas"):

| Fase | Falta |
|---|---|
| 2 – Comando | Chat com o Diretor, caixa "Precisa de você" com aprovações, lista de projetos |
| 3 – Acompanhamento | Kanban de tarefas do `PLANO.md`, medidor de uso (5 h / 7 d), contagem de tokens (o painel do NPC mostra "—") |
| 4 – Vida | Conversas dos NPCs, mascotes, dia/noite, chuva, sons, layouts de TV e celular |
| 5 – Troca | Substituir o Pixel Agents instalado, iniciar com o Windows |

A arte é provisória (desenhada por código). Veja as [Limitações conhecidas](docs/pt-BR/explanation/limitations.md).

## Início rápido

Requisitos: Windows 11, Node.js 26 (`>=26 <27`), npm, Git e um navegador Chromium (Edge ou Chrome).

1. Instale o Node.js 26 LTS em [nodejs.org](https://nodejs.org/) e confira com `node --version`.
2. Clone o repositório e entre na pasta: `git clone <url-do-repositorio> escritorio-equipe` e depois `cd escritorio-equipe`.
3. Instale as dependências exatamente como travadas: `npm ci`.
4. Compile a interface web, o servidor e a CLI: `npm run build`.
5. Abra o escritório: `npm run open` (ou dê dois cliques em `scripts\abrir-escritorio-dev.bat`).

O `open` liga o servidor em segundo plano, se preciso, e abre o navegador já logado. Para desligar: `node dist/cli.js stop`. Passeio passo a passo: [Primeiro uso](docs/pt-BR/tutorials/first-use.md).

## Configuração

Todas as variáveis são opcionais e nenhuma é segredo (os tokens ficam em arquivos, nunca aqui). Defina-as no seu shell só se quiser mudar um padrão (por exemplo `$env:ESCRITORIO_PORT=3300` no PowerShell). O `.env.example` as documenta, mas o servidor não lê um arquivo `.env`. A tabela completa está na [referência de variáveis de ambiente](docs/pt-BR/reference/environment.md).

| Nome | Obrigatória | Padrão | Descrição |
|---|---|---|---|
| `ESCRITORIO_PORT` | não | `3200` | Porta de loopback. Se estiver ocupada, o servidor encerra com erro. |
| `ESCRITORIO_HOME` | não | `%USERPROFILE%\.escritorio-equipe` | Dados de execução (tokens, estado, logs). |
| `ESCRITORIO_DEV_ROOT` | não | deduzida do OneDrive/Documentos | Pasta cujas subpastas são os projetos (`7 - DEV`). |
| `ESCRITORIO_LOG_LEVEL` | não | `info` | `trace`, `debug`, `info`, `warn` ou `error`. |
| `CLAUDE_BIN` | não | do `PATH` | Caminho absoluto do `claude.exe` (usado a partir da Fase 2). |

## Uso

```
npm run open                       # liga se preciso e abre o navegador, já logado
node dist/cli.js status            # está ligado?
node dist/cli.js stop              # desliga o servidor
npm run team:check                 # QUADRO.md x escritorio.json x mapa
npm run settings:diff              # mostra as mudanças propostas nos hooks (não grava nada)
```

Todos os comandos, opções e códigos de saída: [referência da CLI](docs/pt-BR/reference/cli.md).

## Segurança em cinco linhas

1. Escuta só em `127.0.0.1`; a porta nunca muda sozinha.
2. O token longo fica num arquivo só seu e nunca chega ao navegador, a uma URL ou a um log.
3. O navegador recebe um ticket de uso único (60 s), troca por um cookie de sessão `HttpOnly` e `SameSite=Strict`, e as ações ainda exigem `Origin` e CSRF.
4. O navegador nunca envia caminhos, comandos ou variáveis de ambiente; o servidor monta tudo sozinho.
5. Prompts, respostas e entradas de ferramentas nunca são guardados nem logados, e o escritório gasta zero tokens. Veja [Segurança local](docs/pt-BR/explanation/security.md).

## Desenvolvimento

```
npm run dev          # build web em watch + servidor em watch na porta 3200
npm run check        # lint + typecheck + créditos + testes unitários e de integração (obrigatório antes de entregar)
npm run test:e2e     # Playwright (Edge instalado)
npm run schemas:gen  # regera schemas/*.json a partir dos contratos zod
```

## Contribuir

- Código, identificadores e comentários em inglês; textos de interface só via i18n (`src/web/i18n/pt-BR.json` é a fonte, e o `en.json` precisa ter as mesmas chaves).
- A documentação é bilíngue (`docs/en` e `docs/pt-BR`, `README` e `README.pt-BR`): mude as duas no mesmo commit.
- Commits em [Conventional Commits](https://www.conventionalcommits.org/pt-br/) (`feat(server): …`, `fix(web): …`, `docs: …`), pequenos e atômicos, numa branch por fase (`feat/fase-N-<nome>`).
- Todo commit é assinado pela conta dona do repositório; sem trailers de coautoria.
- Asset de terceiros só entra com uma linha no `CREDITS.md` / `CREDITS.pt-BR.md` (`npm run credits:check`).
- Dependência nova exige justificativa no pull request, com versão exata.

## Documentação

Comece pelo [índice da documentação](docs/pt-BR/README.md): tutorial, guias práticos, referência, explicações e o [índice de ADRs](docs/pt-BR/adr/README.md).

## Licença

[MIT](LICENSE). O conceito e parte da abordagem técnica vêm do [Pixel Agents](https://github.com/pablodelucca/pixel-agents), de Pablo De Lucca (MIT); o texto da licença dele fica em `third_party/pixel-agents/LICENSE`. Nenhuma arte, fonte ou som do Pixel Agents é usada. Veja [NOTICE.pt-BR.md](NOTICE.pt-BR.md) e [CREDITS.pt-BR.md](CREDITS.pt-BR.md).
