# Registros de decisão de arquitetura (índice)

[🇺🇸 English](../../en/adr/README.md) · [Índice da documentação](../README.md)

Cada ADR registra uma decisão: contexto, decisão, alternativas e consequências. Os ADRs são escritos em inglês, com um resumo em português no topo, e ficam em [`docs/adr/`](../../adr/). Depois de aceito, um ADR não é editado; uma decisão que muda vira um novo ADR que substitui o antigo.

A coluna de status mostra o que cada arquivo diz. O plano foi aprovado em 2026-11-13 e os ADR-0001 e ADR-0004 a ADR-0008 foram aceitos nesse dia; o ADR-0003 continua "Proposed" até o spike do chat rodar com o `claude` CLI real.

| ADR | Título | Status | Em uma linha |
|---|---|---|---|
| [0001](../../adr/0001-codebase-selective-reuse-of-pixel-agents.md) | Código: repositório novo com reuso seletivo e atribuído do Pixel Agents (MIT) | Accepted (2026-11-13) | Um repositório novo que copia só trechos pequenos e atribuídos do Pixel Agents (MIT) e não reutiliza nenhuma arte dele. |
| [0002](../../adr/0002-rendering-canvas-2d.md) | Renderização: motor Canvas 2D próprio (PixiJS como alternativa medida, Phaser rejeitado) | Accepted with a recorded deviation (CPU no pior caso cerca de 17 % contra 10 %; otimizar na Fase 4, PixiJS só se continuar acima) | Desenhar no tamanho nativo e ampliar por escala inteira; migrar para o PixiJS só se as medições exigirem. |
| [0003](../../adr/0003-chat-session-mode.md) | Modo da sessão de chat: sessão interativa em PTY por padrão, `claude -p` opcional | Proposed (aguarda o spike S-01 com o `claude` CLI real) | O chat conduz uma sessão interativa real do Claude Code e lê o transcript; o modo automático é opcional, com aviso de custo. |
| [0004](../../adr/0004-event-transport-and-approvals.md) | Transporte de eventos e aprovações: hook de comando próprio para o servidor local, em níveis opcionais | Accepted (2026-11-13) | Um hook sem dependências envia eventos; o Nível 0 lê arquivos, o Nível 1 acrescenta hooks ao `settings.json`, o Nível 2 envolve a statusLine. |
| [0005](../../adr/0005-local-security-model.md) | Modelo de segurança local: só loopback, token em arquivo, ticket de uso único, cookie de sessão, Host/Origin/CSRF, pasta-cela dos projetos | Accepted (2026-11-13) | Servidor só local, segredo em arquivo, ticket na URL, cookie no navegador, nenhum comando vindo do navegador. |
| [0006](../../adr/0006-data-sources-readers-and-persistence.md) | Fontes de dados, leitores tolerantes e persistência | Accepted (2026-11-13) | O estado vive em memória; só agregados mínimos são gravados em `~/.escritorio-equipe`, de forma atômica. |
| [0007](../../adr/0007-stack-and-repository-layout.md) | Stack e organização do repositório | Accepted (2026-11-13) | Um único pacote npm, Node 26, Fastify 5, React 19 com Vite 8, TypeScript 6, versões exatas. |
| [0008](../../adr/0008-team-and-map-config-contracts.md) | Contratos de configuração versionados: `escritorio/v1` e `mapa/v1` | Accepted (2026-11-13) | Dois arquivos JSON versionados descrevem a equipe e o andar; as mesas os ligam por id; inválido significa aviso mais o último válido. |

## Relacionado

- [Arquitetura](../explanation/architecture.md)
- [Referência de contratos](../reference/contracts.md)
