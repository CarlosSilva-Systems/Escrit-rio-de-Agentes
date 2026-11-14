# Como fazer logout

[🇺🇸 English](../../en/how-to/log-out.md) · [Índice da documentação](../README.md)

Objetivo: garantir que ninguém mais consiga usar o escritório a partir deste navegador.

> **Ainda não existe um botão "Sair" na interface.** O servidor tem uma rota de logout, mas nenhuma tela da Fase 1 a chama. Use uma das opções abaixo.

## Opção A: deslogar todos os navegadores (recomendada)

Gire o token. Isso invalida todas as sessões de uma vez e derruba as conexões das abas abertas:

```
node dist/cli.js token:rotate
```

Detalhes: [Girar o token de acesso](rotate-token.md).

## Opção B: esquecer só este navegador

1. No navegador, abra as configurações do site `127.0.0.1` e apague os cookies dele (procure o cookie `esc_sid`). No Edge: cadeado ou ícone de ajustes na barra de endereço → Cookies → remover.
2. Recarregue a página. Ela mostra "Abra o escritório pelo atalho".

A sessão também termina sozinha: depois de **8 horas sem uso**, ou **24 horas depois de iniciada**, o que vier primeiro. Aí é só reabrir o escritório pelo atalho (`npm run open`).

## O que não faz logout

- Fechar a aba ou o navegador: o cookie continua válido até expirar.
- Desligar o servidor (`node dist/cli.js stop`): as sessões ficam salvas (como hashes) e sobrevivem a uma reinicialização.

## Relacionado

- [Girar o token de acesso](rotate-token.md)
- [Modelo de segurança local](../explanation/security.md)
