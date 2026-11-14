# Modelo de segurança local

[🇺🇸 English](../../en/explanation/security.md) · [Índice da documentação](../README.md)

O Escritório da Equipe roda no seu PC e, em fases futuras, poderá mandar mensagens ao Claude Code e aprovar ações dele. Então, mesmo sendo "só local", ele é desenhado como se uma página web hostil, ou outro programa da máquina, estivesse tentando usá-lo. O registro da decisão é o [ADR-0005](../../adr/0005-local-security-model.md). Esta página explica o raciocínio.

## Contra o que ele protege, e contra o que não protege

| Ameaça | Defesa |
|---|---|
| Alguém na sua rede | O servidor escuta só em `127.0.0.1`. Não existe opção de endereço, e uma porta ocupada é um erro, nunca um desvio para outra porta. |
| Uma página web que você visita tentando chamar o servidor (CSRF, WebSocket entre sites, DNS rebinding) | Checagem exata do `Host`, checagem exata do `Origin` nas ações e no upgrade do WebSocket, um cabeçalho CSRF, cookie `SameSite=Strict`, nenhum cabeçalho CORS. |
| Um segredo vazando pela URL, histórico, logs ou tela | O token longo nunca vai ao navegador. A URL leva só um ticket de uso único que já está morto quando a página carrega. Os logs ocultam tokens, cookies e tickets. |
| Um programa intruso ocupando a porta para roubar um token | Os clientes pedem ao servidor que prove que conhece o token antes de enviar uma credencial (veja abaixo). |
| Texto hostil em nomes de agentes, nomes de pastas ou conteúdo de arquivos | Mostrado como texto puro, nunca como marcação; Content-Security-Policy restritiva. |
| Força bruta ou enxurrada de requisições | Limites de taxa, limites de tamanho de corpo, teto de 20 clientes WebSocket, comparação de token em tempo constante. |
| **Um malware já rodando como o seu usuário do Windows** | **Sem defesa.** Ele poderia ler os arquivos de token. Os arquivos são restritos ao seu usuário, mas um processo com os seus direitos é você. |

## Como você entra: token, ticket, cookie

```mermaid
sequenceDiagram
  participant U as Você
  participant C as CLI (open)
  participant S as Servidor
  participant B as Navegador
  U->>C: npm run open
  C->>S: GET /api/health/proof (desafio)
  S-->>C: HMAC do meu nonce, então é o servidor de verdade
  C->>S: POST /api/auth/ticket (Bearer token mestre)
  S-->>C: ticket, válido por 60 s, uso único
  C->>B: abre /auth/callback?ticket=…
  B->>S: GET /auth/callback?ticket=…
  S-->>B: 303 para / e Set-Cookie esc_sid (HttpOnly, SameSite=Strict)
  Note over B,S: daqui em diante só o cookie viaja;<br/>ações também levam Origin e X-Escritorio-CSRF
```

Por que três peças em vez de uma senha:

- **Token mestre** (um arquivo, 256 bits aleatórios, permissão só do usuário): prova que é *você* rodando a CLI nesta máquina. Ele nunca sai da CLI e do servidor.
- **Ticket** (uso único, 60 s): permite que a CLI entregue o acesso a um navegador sem pôr um segredo na barra de endereço, onde ele ficaria no histórico, visível na tela e acessível a extensões. Um segundo depois, ele não serve para nada.
- **Cookie de sessão** (`HttpOnly`, então scripts da página não o leem; `SameSite=Strict`, então outros sites não fazem o navegador enviá-lo): mantém você logado por até 8 horas ociosas ou 24 horas no total. Só um hash dele fica no disco.
- **Cabeçalho CSRF e Origin exato** em toda ação: mesmo que um cookie fosse enviado, uma requisição feita por outro site falha na checagem do Origin, e uma que não conhece o valor CSRF da sessão falha na checagem do cabeçalho.
- **Token de hook**: um token separado que só consegue postar eventos. Um token de hook vazado não abre o escritório nem desliga o servidor.

## Desafio de identidade

Um programa qualquer poderia começar a escutar na porta 3200 antes do Escritório e esperar que alguém lhe enviasse um token. Para impedir isso, `GET /api/health/proof?n=<nonce>` devolve um HMAC do nonce de quem chamou, com a chave do token. Só um processo que conhece o token responde certo. A CLI e o script do hook conferem essa prova **antes** de enviar qualquer credencial, e o hook ainda confirma que o `runtime.json` aponta para um processo vivo. A prova não revela nada utilizável: o nonce é escolhido por quem chama e a chave tem 256 bits aleatórios.

## Outras regras

- O navegador envia só texto de mensagem, nomes validados, ids, decisões e configurações de lista fechada. Nunca um caminho, um comando, um argumento ou uma variável de ambiente. Processos filhos são iniciados sem shell e com argumentos montados pelo servidor.
- As pastas de projeto serão limitadas às subpastas de primeiro nível da raiz de projetos, resolvidas pelo caminho real (links, caminhos UNC, nomes 8.3 e nomes reservados são rejeitados) quando o chat chegar, na Fase 2.
- Aprovações nunca terão "sim" como padrão: qualquer erro deixa a decisão para o fluxo normal do Claude.
- O instalador do `settings.json` mostra um diff, faz backup, mescla de forma aditiva e, no arquivo real, exige que você digite `APLICAR` num terminal interativo.
- O escritório nunca lê as credenciais OAuth do Claude.

## Girar e revogar

Use **Configurações → Sair** neste navegador, ou [gire o token](../how-to/rotate-token.md) para invalidar tudo de uma vez. Veja também [Fazer logout](../how-to/log-out.md).

## Relacionado

- [Referência de rotas](../reference/api.md)
- [Privacidade e custo zero de tokens](privacy-and-cost.md)
