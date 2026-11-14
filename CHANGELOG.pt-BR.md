# Changelog

Todas as mudanças relevantes deste projeto são documentadas neste arquivo.
O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/), e o projeto usa
[Versionamento Semântico](https://semver.org/lang/pt-BR/).

Versão em inglês: [CHANGELOG.md](CHANGELOG.md).

## [Não lançado]

## [0.1.0] - 2026-11-14

Primeira fase do escritório local: o painel que mostra a equipe de agentes do Claude Code como um
escritório em pixel art em `127.0.0.1`, com o quadro da equipe, os estados dos NPCs ao vivo, a
atividade e os diagnósticos.

### Adicionado

- Motor Canvas 2D do escritório: o mundo é desenhado em 1x e ampliado uma vez por quadro, com
  limite de 30 fps, degradação de qualidade e pausa com a aba oculta.
- Camadas de mapa e de colisão, pathfinding A*, matemática de câmera e um relógio do estúdio no
  horário de Brasília, com tonalidade de dia e noite.
- Comportamento dos NPCs (máquina de estados v1), atribuição de assentos e chaves de sprite para
  cada agente.
- Barra superior, atalhos de teclado, tela de créditos, cartão, painel e gaveta da equipe do NPC,
  minimapa e uma dica para instalações sem hooks.
- Avisos de diagnóstico com códigos estáveis, traduzidos na interface, e uma sobreposição de
  desenvolvedor ativada com `?debug`.
- Fontes pixel empacotadas sob OFL (Pixelify Sans e Silkscreen), com os textos de licença e os
  créditos.
- Ingestão de hooks, fallback pelas transcrições JSONL, registro da equipe com validação e os
  comandos `team:check` e `team:init`.
- Comando `escritorio` para o ciclo de vida do servidor (`start`, `open`, `stop`, `status`,
  `token:rotate`) e comandos de configurações com diff, aplicação e reversão.
- Portões de qualidade: `credits:check`, `qa:contrast` e `perf:fase1`, além de suítes Playwright e
  de integração para os critérios de aceite da fase 1.

### Alterado

- Os diagnósticos trazem um `code` estável e `params` curtos, em vez de apenas texto livre.
- A chave de deduplicação de eventos do hook e da transcrição não inclui mais o timestamp de
  origem.
- A raiz de desenvolvimento padrão é derivada das variáveis do OneDrive e da pasta do usuário, não
  de um caminho pessoal fixo.
- As sessões do navegador usam uma janela ociosa de 8 h sob um teto absoluto de 24 h.

### Corrigido

- Um NPC que expirou, foi promovido ou saiu da equipe é removido do navegador em vez de continuar na
  tela.
- Eventos duplicados do hook e do fallback por transcrição são contados uma vez.
- Uma recarga da equipe que falha mantém o último quadro válido.
- Parar o observador de transcrições espera o trabalho em andamento, e subagentes em silêncio
  recebem uma parada sintética após dois minutos.
- O servidor encerra limpamente com sinais, e erros não tratados são registrados sem pilha de
  chamadas.
- `stop` só encerra o processo que é dono da porta.
- Alterações de configurações no arquivo real do usuário exigem a palavra de confirmação digitada
  num terminal interativo.

### Segurança

- Os clientes verificam a identidade do servidor (desafio HMAC) antes de enviar o token mestre ou o
  token do hook.
- Os limites de taxa são decididos pelo caminho normalizado, com balde por sessão e balde anônimo
  por endereço.
- O logout fecha os sockets da sessão e esquece a sessão.
- Valores com aparência de segredo são mascarados nas linhas de contexto do diff de configurações.

[Não lançado]: https://github.com/CarlosSilva-Systems/Escrit-rio-de-Agentes/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/CarlosSilva-Systems/Escrit-rio-de-Agentes/releases/tag/v0.1.0
