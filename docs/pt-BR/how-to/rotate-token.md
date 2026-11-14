# Como girar o token de acesso

[🇺🇸 English](../../en/how-to/rotate-token.md) · [Índice da documentação](../README.md)

Objetivo: trocar os segredos que protegem o escritório (por exemplo depois de compartilhar a tela ou de suspeitar que alguém leu os arquivos de token) e deslogar todos os navegadores.

## Passos

1. Rode:

   ```
   node dist/cli.js token:rotate
   ```

   Ele mostra: `Tokens regenerados. Todas as sessões do navegador foram invalidadas; use "escritorio open" para entrar de novo.`
2. Entre de novo:

   ```
   npm run open
   ```

## O que acontece

- Um novo token mestre e um novo token de hook são gravados (256 bits cada, permissão só do usuário). Os antigos deixam de valer na hora.
- As sessões de navegador salvas (`sessions.json`) são apagadas.
- Um servidor em execução percebe os arquivos alterados sozinho, em cerca de um segundo, esquece todas as sessões e fecha os WebSockets abertos com o código `4401`. As abas abertas passam a mostrar "Abra o escritório pelo atalho" e não ficam tentando reconectar em laço.
- Não precisa reiniciar o servidor nem mexer nos hooks do Claude Code: o script do hook lê o `hook-token` do disco a cada execução.

## Com o servidor desligado

O comando funciona igual: ele só reescreve os arquivos. A próxima partida já usa os novos tokens.

## Relacionado

- [Fazer logout](log-out.md)
- [Modelo de segurança local](../explanation/security.md)
- [Referência de arquivos](../reference/files.md)
