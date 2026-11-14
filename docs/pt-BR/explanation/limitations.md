# Limitações conhecidas da Fase 1

[🇺🇸 English](../../en/explanation/limitations.md) · [Índice da documentação](../README.md)

Uma lista honesta do que falta, é provisório ou imperfeito na versão `0.1.0`. Os itens marcados "gate" esperam uma decisão ou ação sua (veja `docs/projeto/2026-11-12-escritorio-equipe/PLANO.md`).

## Ainda não construído

- **Fases 2 a 5.** O chat com o Diretor, a caixa de aprovações, a criação de projetos, o kanban de tarefas, o medidor de uso, a contagem de tokens, as conversas dos NPCs, os mascotes, o dia/noite e os sons, e a troca do Pixel Agents instalado não existem. Os painéis C, T, A e M mostram um aviso provisório. O painel do NPC mostra "—" nos tokens.
- **Nível 2 do settings** (envolver a statusLine): o script não existe; não aplique `--level 2`.

## Esperando você (gates)

- **G1, a lista de nomes.** O `escritorio.json` não foi criado, então o escritório roda com uma equipe de reserva deduzida do `QUADRO.md` (todos em mesas provisórias) e mostra um aviso. A skill `rh-equipe` ainda não atualiza o arquivo.
- **G4, o diff do `settings.json`.** Nada foi aplicado. Sem o Nível 1, o escritório depende da leitura dos arquivos de sessão (atraso de 1–2 s).
- **G2, Claude Code CLI.** Ele não está instalado na máquina de desenvolvimento, então os formatos dos payloads de hook foram montados a partir da documentação e de fixtures sintéticas. Eles não foram conferidos contra uma execução real do Claude Code, e uma sessão real do Claude Desktop não foi observada de ponta a ponta. Trate os nomes de campos do hook como provisórios até essa conferência.
- **Status dos ADRs.** Os oito ADRs ainda dizem "Proposed", embora o plano tenha sido aprovado em 2026-11-13; o ADR-0002 e o ADR-0003 dependem explicitamente dos spikes e da sua confirmação.

## Desempenho

- **A CPU no pior caso é cerca de 15,7 % de um núcleo** (20 NPCs andando, chuva e noite) contra uma meta de 10 %. Parado e no uso comum as metas são cumpridas (2,8 % parado, 3,5 % com cinco trabalhando). As otimizações estão identificadas; veja [Por que Canvas 2D](why-canvas-2d.md) e [Desempenho](../reference/performance.md).
- Não medido: execução de CPU de 10 minutos, janela do Edge visível, servidor rodando 8 horas.

## Aparência

- **A arte é provisória**, desenhada por código, sem imagens de terceiros. O pacote de arte final não foi escolhido nem comprado (gate G3), e pacotes pagos sem direito de redistribuição ficariam em `assets-private/`, fora do Git.
- O servidor acompanha no máximo 12 Freelancers (visitantes) por vez e descarta os eventos dos demais com um aviso. O mapa tem assentos para cerca de 15 visitantes.

## Interface

- **Não há botão "Sair".** O servidor tem a rota; use a [rotação de token](../how-to/rotate-token.md) ou apague o cookie ([Fazer logout](../how-to/log-out.md)).
- **As escolhas de idioma e som ficam só no navegador.** O navegador chama `PATCH /api/config`, que o servidor ainda não implementa, e ignora a falha. O idioma da linha de comando vem do `config.json`, que você edita à mão.
- **O Esc fecha uma camada por vez** (até quatro apertos para limpar tudo), por desenho.

## Plataforma

Só Windows 11, um usuário, só `127.0.0.1`.

## Relacionado

- [Cobertura dos requisitos](../reference/requirements-coverage.md)
- [Arquitetura](architecture.md)
