# Por que um motor Canvas 2D próprio

[🇺🇸 English](../../en/explanation/why-canvas-2d.md) · [Índice da documentação](../README.md)

O registro da decisão é o [ADR-0002](../../adr/0002-rendering-canvas-2d.md); as medições estão no relatório do spike `docs/projeto/2026-11-12-escritorio-equipe/spikes/S-02-render.md`.

## O problema

O escritório precisa parecer pixel art nítida em zoom 2×, 3× e 4× (também com a escala do Windows em 125 % e 150 %), animar uns vinte personagens e várias luzes, e ainda custar quase nada quando você deixa a aba aberta o dia inteiro.

## A decisão

Desenhar o mundo inteiro num canvas pequeno, fora da tela, no tamanho nativo (64×52 tiles de 16 px dão só 1024×832 pixels), assar as partes estáticas (piso, paredes, móveis) uma vez e depois pintar o resultado no canvas visível com **uma** cópia ampliada por quadro, com escala inteira e sem suavização. Como o custo está atrelado à imagem nativa pequena, ele quase não muda com o zoom nem com o tamanho da janela, e os pixels ficam perfeitamente nítidos por construção.

O laço de quadros é nosso: limitado a 30 quadros por segundo, mais lento (cerca de 6 fps) quando só há animação ambiente, totalmente parado enquanto a aba está oculta, e limitado para que nada dê um salto quando você volta.

## Alternativas

- **PixiJS** (WebGL): excelente para milhares de sprites ou iluminação por shader, o que esta cena não precisa. Traz uma dependência, tratamento de perda de contexto e despertares da GPU mesmo em taxas baixas. Mantido como alternativa a medir.
- **Phaser**: um framework de jogos completo, com laço, entrada e cenas próprios. Se sobrepõe ao React e à nossa própria simulação e é o mais pesado. Rejeitado.
- **Sprites em DOM ou CSS**: centenas de elementos em movimento, custo de layout e bordas borradas em escala fracionária. Rejeitado.

## O que as medições dizem

- Aba oculta: zero quadros desenhados e cerca de 0,2 % de CPU. Retomar leva alguns milissegundos.
- Nitidez: com densidade 1, 1,25 e 1,5 a tela não contém nenhuma cor que não esteja na imagem nativa.
- Nunca mais de 28 quadros em um segundo; bundle de 154 kB gzip para o app inteiro.
- Parado, aba visível: 3,3 % de um núcleo (meta de 5 %). **O pior caso, com 20 personagens andando, chuva e noite, custa cerca de 17,3 % contra uma meta de 10 %.** O custo acompanha a taxa de quadros e não o número de personagens. Por isso o spike recomenda não trocar para o PixiJS ainda: aplicar as otimizações baratas já identificadas (redesenhar só a região suja, pular passes de iluminação quando nada mudou, 20 fps quando só um a três personagens andam), medir de novo por 10 minutos com janela visível e abrir um novo ADR só se o resultado continuar acima de 10 % com o PixiJS claramente à frente. A decisão final é do arquiteto e do dono do projeto. O PixiJS não foi comparado porque o plano limitou o spike a medir primeiro o Canvas 2D, e o ADR-0002 ainda consta como "Proposed". Veja [Limitações conhecidas](limitations.md) e [Desempenho](../reference/performance.md).

## Relacionado

- [Arquitetura](architecture.md)
- [Índice de ADRs](../adr/README.md)
