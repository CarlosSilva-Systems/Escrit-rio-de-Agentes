# Como fazer logout

[🇺🇸 English](../../en/how-to/log-out.md) · [Índice da documentação](../README.md)

Objetivo: garantir que ninguém mais consiga usar o escritório a partir deste navegador.

## Sair pela interface

1. Aperte **Configurações** na barra superior.
2. Escolha **Sair**.
3. Uma janela pergunta "Sair do escritório?" e avisa que, para voltar, você precisa abrir o escritório de novo pelo atalho. As suas sessões do Claude Code não são afetadas. Confirme com **Sair**.

O servidor esquece a sessão deste navegador, o cookie é removido e a página mostra "Abra o escritório pelo atalho" sem recarregar. Para entrar de novo, use o atalho ou `npm run open`.

## Alternativas

- **Deslogar todos os navegadores de uma vez:** gire o token com `node dist/cli.js token:rotate` ([Girar o token de acesso](rotate-token.md)).
- **Esquecer este navegador pelo lado do navegador:** apague o cookie `esc_sid` de `127.0.0.1` nas configurações de site e recarregue.

## Quando a sessão termina sozinha

Depois de **8 horas sem uso** (as 8 horas recomeçam a cada uso do escritório) ou **24 horas depois de iniciada**, o que vier primeiro. Reabra pelo atalho.

## O que não faz logout

- Fechar a aba ou o navegador: o cookie continua válido até expirar.
- Desligar o servidor (`node dist/cli.js stop`): as sessões ficam salvas (como hashes) e sobrevivem a uma reinicialização.

## Relacionado

- [Girar o token de acesso](rotate-token.md)
- [Modelo de segurança local](../explanation/security.md)
