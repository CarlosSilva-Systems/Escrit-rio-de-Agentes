# Privacidade e custo zero de tokens

[🇺🇸 English](../../en/explanation/privacy-and-cost.md) · [Índice da documentação](../README.md)

## O que nunca é guardado nem logado

O Escritório da Equipe mostra *quem* está fazendo *que tipo* de trabalho, não *o que foi dito*. Por desenho, ele nunca persiste nem registra em log:

- prompts que você digitou, respostas do Claude, texto do assistente;
- entradas de ferramentas (`tool_input`), saídas de ferramentas, conteúdo de arquivos;
- o texto-resumo da tarefa de um subagente;
- tokens, cookies ou tickets de uso único (as linhas de log são limpas desses valores).

O que ele guarda em memória ou em disco são metadados: tipos de evento, tipos e ids de agentes, ids de sessão, **nomes** e categorias de ferramentas (edição, leitura, comando, web, delegação, tarefa, plano, outra), o nome da pasta do projeto tirado da pasta de trabalho, horários e contadores. Os últimos 500 itens de atividade ficam só em memória e somem quando o servidor para. Em disco há apenas os arquivos de token, o `config.json`, as sessões de navegador em forma de hash, o `runtime.json` e logs rotativos (7 dias).

Onde fica o filtro:

- **Script do hook**: só uma lista permitida de campos curtos sai do processo; `tool_input`, respostas de ferramentas, prompts e texto do assistente são descartados *antes* de qualquer coisa ir para a rede. O hook só envia para `127.0.0.1`.
- **Leitor de arquivos de sessão (Nível 0)**: o parser guarda ids, nomes de ferramentas e contadores; nenhum texto sai dele.
- **Testes**: textos "canário" plantados em prompts, campos desconhecidos, cabeçalhos e entradas de ferramenta enormes nunca podem aparecer em nenhum estado, resposta ou log. Isso é verificado automaticamente.

Nada é enviado à internet. Um teste confirma que o navegador só fala com `127.0.0.1` e que nenhum processo `claude` é iniciado na Fase 1.

## Custo zero de tokens

O escritório em si **não gasta tokens**. Na Fase 1 ele nunca executa `claude -p`, nunca usa o Agent SDK e nunca chama uma API paga; só lê arquivos e recebe eventos locais. A regra do projeto é que nenhuma chamada paga acontece sem uma ação explícita sua. Os testes usam um Claude falso (`tests/fixtures/fake-claude.mjs`).

Isso importa porque, nos planos de assinatura, o uso programático do Claude pode consumir um crédito separado. A partir da Fase 2 o chat usará por padrão uma sessão interativa normal do Claude Code num terminal (que conta nos seus limites normais, como usar o Claude você mesmo), e um modo automático com `claude -p` só existirá se você ligar, com um aviso claro de custo. Os detalhes e a questão da cobrança estão no [ADR-0003](../../adr/0003-chat-session-mode.md), que ainda aguarda a sua confirmação.

## Relacionado

- [Modelo de segurança local](security.md)
- [Ver sessões do Claude Desktop](../how-to/see-desktop-sessions.md)
