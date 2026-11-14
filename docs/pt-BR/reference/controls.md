# Referência: controles de teclado e mouse

[🇺🇸 English](../../en/reference/controls.md) · [Índice da documentação](../README.md)

## Teclado

Atalhos de uma letra nunca disparam enquanto você digita num campo de texto ou no terminal, nem com Ctrl, Alt ou Meta apertados. Nenhum atalho aprova ou nega nada.

| Tecla | Ação |
|---|---|
| `C` | Alterna o painel de Chat (aviso provisório até a Fase 2) |
| `T` | Alterna o painel de Tarefas (aviso provisório até a Fase 3) |
| `A` | Alterna o painel de Aprovações, "Precisa de você" (aviso provisório até a Fase 2) |
| `M` | Alterna o painel do Mapa |
| `?` | Abre a lista de atalhos |
| `Esc` | Fecha a camada mais interna (ordem abaixo) |
| Setas | Movem o mapa (param de seguir um NPC) |
| `+` ou `=` / `-` | Aproximam / afastam |
| `Tab`, `Shift+Tab` | Percorrem todos os controles; o anel de foco é sempre visível |
| `Enter`, `Espaço` | Ativam o controle em foco (por exemplo, abrir o painel de um NPC pela lista da Equipe) |

O `Esc` fecha as coisas nesta ordem, uma por aperto: janela (Créditos, Atalhos) → menu Configurações → painel do NPC (com o cartão de hover) → cartão de hover → gaveta da Equipe → seguir um NPC → o painel C/T/A/M.

## Mouse

| Gesto | Ação |
|---|---|
| Roda sobre o mapa | Zoom entre 2×, 3× e 4× (passos inteiros, ancorado no ponteiro) |
| Arrastar com o botão esquerdo | Move o mapa; para de seguir |
| Ponteiro sobre um NPC | Cartão de hover (nome, cargo, departamento, status, tempo) em até 150 ms |
| Clicar num NPC | Abre o painel dele (histórico recente, tarefas atuais, tokens) |
| Clicar no chão vazio | Fecha o painel do NPC |
| Clicar no minimapa | Centraliza a câmera ali |

## Barra superior

Equipe (abre a gaveta com um botão Seguir por NPC), Som (liga/desliga), Idioma (pt-BR ⇄ en, sem recarregar), Configurações (Créditos, Atalhos de teclado, Sair, que pede confirmação).

## Parâmetros de URL para desenvolvedores

Acrescente-os ao endereço depois de entrar. Eles mudam só como a página aparece; nada chega ao servidor.

| Parâmetro | Efeito |
|---|---|
| `?debug` | Painel de depuração (quadros por segundo, tempo de quadro p95, zoom, densidade, estado do mapa e dos sprites) |
| `?demo=N` | N personagens de demonstração, de 0 a 64 |
| `?seed=N` | Semente aleatória da demonstração e das rotinas |
| `?zoom=2\|3\|4` | Zoom inicial |
| `?debugTime=2026-12-24T21:00` | Horário simulado do estúdio |
| `?rain` | Efeito de chuva (teste visual) |
| `?dirty=0` | Redesenha o mundo inteiro a cada quadro (comparação de desempenho) |
| `?quality=auto\|high\|medium\|low` | Qualidade de desenho |

## Comportamentos que valem saber

- Uma aba oculta do navegador desenha zero quadros; ao voltar, os NPCs cujo status mudou vão direto ao lugar certo.
- Com `prefers-reduced-motion`, os NPCs pulam para o destino em vez de andar e a animação decorativa para; o status continua escrito em texto.
- O desenho nunca passa de 30 quadros por segundo; um escritório parado desenha cerca de 6.

## Relacionado

- [Primeiro uso](../tutorials/first-use.md)
- [Desempenho medido](performance.md)