# Guia visual e brief de design — Escritório da Equipe

> Autora: Bianca (designer-ux). Data: 2026-11-12. Versão 1 (para aprovação do Carlos, antes da construção).
> Fonte da verdade do pedido: `docs/projeto/2026-11-12-escritorio-equipe/PEDIDO.md` (§7 é o design). Requisitos: `REQUISITOS.md` (CA-22, CA-24, CA-74, CA-82 afetam este guia).
> Arquivos irmãos: `COMPONENTES.md`, `MAPA.md`, `PERSONAGENS.md`, `ASSETS.md`, `tokens.css`, `tailwind.theme.cjs`, `mockups/`.
> Nome do estúdio: **"Estúdio Carlos"** é só placeholder visível até o Carlos informar o nome (ver decisões no fim).

---

## 1. Brief de design

**Público.** Um único usuário: Carlos, dev full-stack, Windows 11. Vai deixar o painel num **segundo monitor o dia inteiro**: o visual precisa dar conforto, pouca fadiga, e permitir ler o estado em 2 segundos olhando de lado. Também usa o painel ativamente (pedir, aprovar, acompanhar), então a parte funcional não pode ficar atrás da graça.

**Objetivo de cada área**

| Área | Objetivo | O que o Carlos deve entender em 2 s |
|---|---|---|
| Escritório (mapa) | Dar vida e contexto: quem está fazendo o quê, onde | "A Lívia está no Sites, a Teresa está parada" |
| Barra superior | Estado global | Limite 5h/7d, quantos agentes trabalham, se algo precisa dele |
| Gaveta Projetos | Navegar por projetos | Qual projeto avança e em que fase |
| Gaveta direita | Falar, decidir, acompanhar | "Tem 2 aprovações esperando" |
| Painel inferior (kanban) | Detalhar tarefas do projeto | Quem faz qual tarefa e o que está bloqueado |
| Modo TV | Painel de parede | Limite e aprovações, legíveis a 2 m |
| Celular | Consulta e aprovação rápida (só rede local, por ora) | Aprovar sem abrir o PC |

**Tom de voz.** Acolhedor, direto e levemente bem-humorado, como um escritório pequeno e simpático. Frases curtas, verbos de ação, tratamento por "você". Humor só nas falas dos NPCs e em estados vazios; nunca em erros, alertas de limite ou aprovações (aí a mensagem é clara, calma e sem piada). Nunca culpar o usuário. Nunca usar jargão sem explicar ("hook" aparece só em Configurações e na documentação).

**Princípios**
1. **Clareza antes de estética.** A decoração nunca esconde informação; a informação nunca depende só de cor (sempre ícone + texto).
2. **Aconchego sem cansaço.** Fundo escuro quente (não preto puro), brilho moderado, movimento lento, nada pisca mais de 3 vezes por segundo (CA-22).
3. **Mobile-first.** A ordem de empilhamento do celular define a prioridade: aprovações > limite > projetos > escritório.
4. **Consistência.** Um único conjunto de tokens, um único padrão por tipo de componente (cartão, aba, botão).
5. **Acessibilidade WCAG 2.2 AA.** Foco visível, teclado, leitores de tela, contraste calculado (seção 4).
6. **Performance.** Fontes locais (WOFF2, subconjunto latim), sem imagens decorativas no HUD (ícones em sprites/SVG pixel), HUD em DOM leve sobre o canvas.
7. **Pixel nítido.** Zoom só em inteiros (2×, 3×, 4×), `image-rendering: pixelated`, sem desfoque.

**Referências (inspiração de estilo e de padrão, não de cópia de arte)**
- Stardew Valley (visão 3/4, paleta quente): https://www.stardewvalley.net/
- Gather Town (escritório virtual 2D, presença de pessoas): https://www.gather.town/
- Pixel Agents (base técnica e conceito de agentes como NPCs; arte **não** reutilizada, ver `ASSETS.md`): https://github.com/pixel-agents-hq/pixel-agents
- WCAG 2.2: https://www.w3.org/TR/WCAG22/
- Pixelify Sans (OFL): https://fonts.google.com/specimen/Pixelify+Sans · Silkscreen (OFL): https://fonts.google.com/specimen/Silkscreen

---

## 2. Paleta

Valores prontos em `tokens.css` e `tailwind.theme.cjs`. Dois grupos: **arte do mapa** (referência para quem desenha; a arte final fica nos sprites) e **HUD** (tema escuro).

### 2.1 Arte do mapa (aconchegante)

| Token | HEX | Uso |
|---|---|---|
| floor-honey | `#D9A566` | piso de madeira mel (base) |
| floor-honey-dark | `#C98F52` | junta/tábua alternada |
| floor-honey-light | `#E8BB80` | brilho/tábua clara |
| wall-cream | `#F3E6CC` | paredes (face) |
| wall-cream-shade | `#E2D0AE` | sombra da parede |
| wall-trim | `#B98C5A` | rodapé e batentes |
| teal | `#4FB3A5` | verde-água: detalhes, cadeiras, sofás, vasos |
| teal-deep | `#2E7F76` | sombra do verde-água |
| terracotta | `#C8643F` | vasos, tapetes, almofadas |
| terracotta-light | `#E08A5F` | realce |
| leaf / leaf-deep | `#4E9A4F` / `#2F6B3A` | plantas (muitas) |
| outline | `#3B2A20` | contorno de sprites (marrom escuro, mais suave que preto) |
| soc-floor / soc-screen / soc-blue | `#26323F` / `#4FE38B` / `#4A7BD0` | Sala SOC: piso escuro, telões verdes, luz azulada |

Regra: contorno de 1 px em `outline` em todos os objetos e personagens; no máximo 4 tons por material; sombras de piso em `#3B2A20` com 25% de opacidade (1 tile de deslocamento para baixo-direita).

### 2.2 Cores de departamento

Cada departamento tem 3 tokens: **light** (texto, ícone e crachá no HUD escuro), **base** (tapete, placa de porta, arte) e **on** (texto sobre o base). O crachá do NPC usa `light` com texto `ink`.

| Departamento | light (HUD) | base (arte) | on (texto sobre base) | Membros |
|---|---|---|---|---|
| Diretoria (dourado) | `#EDBE45` | `#C9962A` | `#1F1A17` | Diretor de Projetos |
| Planejamento (lilás) | `#BCA3EE` | `#9A7DD6` | `#1F1A17` | Alice, Artur, Bianca |
| Engenharia (azul) | `#78B0F5` | `#5B94E0` | `#1F1A17` | Lívia, Bruno, Otávio, Eduardo, Rafael |
| Qualidade/Segurança (verde) | `#6FCF7C` | `#3E9B55` | `#1F1A17` | Teresa, Rita, Sérgio, Pedro |
| Entrega (laranja) | `#F59F45` | `#E0792B` | `#1F1A17` | Gabriela, Davi |
| Biblioteca (vinho) | `#E58AA5` | `#8E2F4B` | `#F6EBDD` | Paula |

Nota: o vinho "puro" é escuro demais para texto/ícone no HUD escuro; por isso o `light` é um rosado-vinho. Na arte (tapete, placa) usa-se o vinho `base`. Freelancer não tem cor de departamento: crachá de visitante cinza-creme `#D4C3B0` com tarja "VISITANTE"/"VISITOR".

### 2.3 HUD (tema escuro quente)

| Token | HEX | Uso |
|---|---|---|
| bg-900 | `#1F1A17` | fundo base |
| bg-800 | `#2A2320` | barra superior, gavetas, painel inferior |
| bg-700 | `#3A312C` | cartões, campos, itens elevados |
| bg-track | `#120F0D` | trilho das barras, sombras duras |
| border-soft | `#5A4A40` | divisores decorativos |
| border-strong | `#94806E` | contorno de controles e barras |
| text-1 / text-2 / text-3 | `#F6EBDD` / `#D4C3B0` / `#B5A18C` | principal / secundário / terciário |
| text-disabled | `#8A7766` | desabilitado |
| ink | `#1F1A17` | texto sobre fundos claros |
| teal-300 | `#5FC9B8` | ação primária, links |
| terra-300 | `#E8896A` | destaque, avisos suaves |
| focus | `#FFD84D` | anel de foco |

Só existe tema escuro no HUD (decisão deliberada: segundo monitor o dia todo). Tema claro fica como opção futura (decisão do Carlos, seção 11).

### 2.4 Estado: medidor de limite (5 h e 7 d) e alertas

| Faixa | Regra (CA-56) | Cor do preenchimento | Sinal extra (nunca só cor) |
|---|---|---|---|
| Verde | 0–60 % (inclusive) | `#5FCB6E` | texto "OK" no tooltip; sem ícone |
| Amarelo | >60 % a 85 % | `#F2C94C` | ícone de atenção (triângulo 8×8) a partir de 80 % |
| Vermelho | >85 % | `#F2685A` | ícone "!" 8×8 |
| Crítico (piscando) | >95 % | `#F2685A` alternando com `#FFD84D` a 1 Hz (2 mudanças/s, abaixo do limite de 3 flashes/s) | ícone "!!" + borda dupla; com reduced-motion: sem piscar, borda dupla fixa |

Texto vermelho em fundo escuro usa `danger-text #F77B6B` (o `#F2685A` serve só para preenchimento e borda).

**Bordas de alerta** (aplicam em barra, cartão e banner): atenção = 2 px `#F2C94C`; crítico = 2 px `#F2685A` + 2 px interna `#1F1A17` (borda dupla); informativo = 2 px `#5FC9B8`; "precisa de você" = 2 px `#F2685A` no cartão.
Alerta de limiar: aos 80 % banner amarelo (fundo `bg-700`, borda esquerda 4 px amarela, texto `text-1`); aos 95 % banner crítico (fundo `#F2685A`, texto `ink`, 5,66:1).

### 2.5 Ciclo dia/noite (horário de Brasília, `America/Sao_Paulo`, UTC−3, sem horário de verão desde 2019)

A sobreposição de luz cobre **só o mapa** (canvas); o HUD nunca é tingido (legibilidade). Quatro tons, com mistura linear de 30 min entre eles (15 min antes e 15 min depois da fronteira):

| Tom | Faixa (Brasília) | Sobreposição no mapa | Céu nas janelas | Extras |
|---|---|---|---|---|
| Amanhecer | 05:30–07:59 | `rgba(255,181,138,0.18)` | `#FFD8B0` | luminárias apagam às 07:00 |
| Dia | 08:00–16:59 | nenhuma (`alpha 0`) | `#BFE3F5` | — |
| Entardecer (pôr do sol) | 17:00–18:59 | `rgba(255,138,91,0.22)` | `#FFA36B` | luminárias acendem às 18:30 |
| Noite | 19:00–05:29 | `rgba(30,42,94,0.42)` | `#1B2748` + estrelas | luminárias e cordão do terraço acesos; brilho de monitores |

Bocejos (CA-74): frequência relativa ×1 (06:00–18:59), ×1,5 (19:00–21:59), ×3 (22:00–05:29). A Sala SOC mantém ambiente próprio azulado e dá menos peso ao ciclo (sobreposição da noite a 50 %). Luzes (lâmpadas, telões, LEDs, tela dos monitores) são desenhadas **acima** da sobreposição, como pontos de brilho (`rgba(255,217,160,0.55)`), para parecer iluminação de verdade. Salas de projeto apagadas usam `rgba(14,10,20,0.35)` adicional; acesas, sem camada extra. Em reduced-motion a transição entre tons vira troca direta (sem mistura).

---

## 3. Tokens

Arquivos prontos: `tokens.css` (variáveis CSS) e `tailwind.theme.cjs` (tema Tailwind). Resumo:

| Grupo | Valores |
|---|---|
| Espaçamento (múltiplos de 4 px) | 4, 8, 12, 16, 20, 24, 32, 40, 48, 64 |
| Raios | 0 (padrão), 4 px (chanfro), 8 px (só painéis grandes). Quinas "em degrau" feitas com `clip-path`/borda em camadas, sem curva suave |
| Sombras pixel (duras, sem blur) | `px1: 0 2px 0 #120F0D`; `px2: 0 4px 0 #120F0D`; `px3: px2 + 0 8px 0 rgba(18,15,13,.5)`; contorno `0 0 0 2px #94806E`; foco `0 0 0 2px #1F1A17, 0 0 0 4px #FFD84D` |
| Z-index | mapa 0 · balões/ícones 10 · minimapa 20 · painel inferior 30 · gavetas 40 · barra superior 50 · popover/hover do NPC 60 · modal 70 · toast 80 |
| Movimento | 120 / 160 / 240 ms, easing `steps(4)` (efeito "pixel"); zero com reduced-motion |
| Alvos de toque | desktop mínimo 32×32 px; celular 44×44 px (WCAG 2.2 pede 24×24 no mínimo) |

---

## 4. Contraste WCAG (calculado)

Método: fórmula WCAG 2.x (luminância relativa sRGB; razão = (L1+0,05)/(L2+0,05)). **Calculado à mão, sem script** (nesta sessão não havia ferramenta de execução); arredondado a 2 casas, erro estimado ≤ 0,05. **A Teresa deve reconferir por script** (os HEX estão em `tokens.css`). Exigência: texto ≥ 4,5:1; UI/ícones/foco ≥ 3:1. Todos os pares abaixo passam.

Luminâncias de referência: bg-900 0,0109 · bg-800 0,0180 · bg-700 0,0328 · track 0,0050 · text-1 0,8424 · text-2 0,5615 · text-3 0,3720.

### 4.1 Texto no HUD

| Texto | HEX | em bg-900 | em bg-800 | em bg-700 | Resultado |
|---|---|---|---|---|---|
| text-1 | `#F6EBDD` | 14,65 | 13,13 | 10,78 | passa AA/AAA |
| text-2 | `#D4C3B0` | 10,04 | 9,00 | 7,39 | passa |
| text-3 | `#B5A18C` | 6,93 | 6,21 | 5,10 | passa |
| teal-300 | `#5FC9B8` | 8,64 | 7,75 | 6,36 | passa |
| terra-300 | `#E8896A` | 6,74 | 6,04 | 4,96 | passa |
| danger-text | `#F77B6B` | 6,57 | 5,88 | 4,83 | passa |
| meter-yellow (texto) | `#F2C94C` | 10,86 | 9,73 | 7,99 | passa |
| meter-green (texto) | `#5FCB6E` | 8,41 | 7,54 | 6,19 | passa |
| dept diretoria `#EDBE45` | | 9,89 | 8,86 | 7,28 | passa |
| dept planejamento `#BCA3EE` | | 7,89 | 7,07 | 5,80 | passa |
| dept engenharia `#78B0F5` | | 7,65 | 6,86 | 5,63 | passa |
| dept qualidade `#6FCF7C` | | 8,94 | 8,01 | 6,58 | passa |
| dept entrega `#F59F45` | | 8,15 | 7,30 | 6,00 | passa |
| dept biblioteca `#E58AA5` | | 6,98 | 6,26 | 5,14 | passa |

Observação: `meter-red #F2685A` **não** é usado como texto sobre bg-700 (4,17:1 falharia); o texto vermelho usa `danger-text`.

### 4.2 Texto sobre fundos coloridos (botões, crachás, placas, contadores)

| Par (texto sobre fundo) | Razão | Uso |
|---|---|---|
| ink `#1F1A17` sobre teal-300 `#5FC9B8` | 8,64 | botão primário "Aprovar" |
| ink sobre terra-300 `#E8896A` | 6,74 | botão destaque |
| ink sobre meter-red `#F2685A` | 5,66 | contador "Precisa de você", banner crítico |
| ink sobre meter-yellow `#F2C94C` | 10,86 | texto dentro da barra amarela |
| ink sobre meter-green `#5FCB6E` | 8,41 | texto dentro da barra verde |
| ink sobre dept-light Diretoria / Planej. / Eng. / Qual. / Entrega / Bibl. | 9,89 / 7,89 / 7,65 / 8,94 / 8,15 / 6,98 | crachás no HUD |
| ink sobre dept-base Diretoria `#C9962A` | 6,47 | placa de porta |
| ink sobre dept-base Planejamento `#9A7DD6` | 5,15 | placa de porta |
| ink sobre dept-base Engenharia `#5B94E0` | 5,54 | placa de porta |
| ink sobre dept-base Qualidade `#3E9B55` | 4,95 | placa de porta |
| ink sobre dept-base Entrega `#E0792B` | 5,70 | placa de porta |
| text-1 `#F6EBDD` sobre dept-base Biblioteca `#8E2F4B` | 6,71 | placa de porta |
| ink sobre text-1 (balão de fala, fundo creme) | 14,65 | balões |

### 4.3 UI, ícones e foco (mínimo 3:1)

| Elemento | Par | Razão |
|---|---|---|
| Contorno de controle | border-strong `#94806E` sobre bg-900 / 800 / 700 | 4,57 / 4,10 / 3,37 |
| Preenchimento verde / amarelo / vermelho do medidor sobre bg-800 | `#5FCB6E` / `#F2C94C` / `#F2685A` | 7,54 / 9,73 / 5,08 |
| Preenchimento sobre o trilho `#120F0D` | verde / amarelo / vermelho | 9,32 / 12,03 / 6,28 |
| Anel de foco `#FFD84D` sobre bg-900 / 800 / 700 | | 12,46 / 11,17 / 9,17 |
| Ícones dept-light | mesmos valores de 4.1 | todos ≥ 5,14 |
| Texto desabilitado `#8A7766` sobre bg-800 | isento (componente inativo), mantido ≥ 3 | 3,61 |

O anel de foco é duplo (anel interno escuro + externo amarelo), então também passa sobre o mapa claro (piso mel, paredes creme), onde o anel escuro garante ≥ 3:1.

### 4.4 Texto dentro do mapa (placas, crachás em sprite)

Placas e crachás usam os pares da tabela 4.2 (todos ≥ 4,5). O ciclo de noite não afeta placas e rótulos de HUD desenhados na camada de UI do mapa (desenhados acima da sobreposição). Texto sobre o piso mel direto (sem plaquinha) **não é permitido**: todo rótulo no mapa leva plaquinha (fundo `bg-800` + texto `text-1`).

---

## 5. Tipografia

| Papel | Fonte | Licença | Onde |
|---|---|---|---|
| Interface (títulos, rótulos, números, corpo curto) | **Pixelify Sans** (Stefie Justprince / Typecalism, OFL 1.1) | OFL | HUD, cartões, abas, chat (corpo) |
| Placas e crachás | **Silkscreen** (Jason Kottke, OFL 1.1) | OFL | placas de porta, crachás, contadores grandes |
| Terminal e blocos de código | Cascadia Mono / Consolas (fontes do sistema) | do sistema | aba Terminal, código no chat |
| **Não usar** | FS Pixel Sans (licença conflitante, ver PESQUISA.md) | — | — |

Regras:
- **Mínimo absoluto 14 px** (`--fs-sm`) em texto de interface; corpo padrão 16 px; títulos 20/24/32. Abaixo de 14 px só em sprites de arte (nunca em HTML).
- **Silkscreen só em múltiplos de 8 px** (16/24/32), em maiúsculas curtas (≤ 14 caracteres), nunca para frases. É uma fonte de grade 8 px: tamanhos fora do múltiplo ficam borrados.
- Pixelify Sans: testar nitidez nos tamanhos 14/16/20/24/32 antes de congelar (a grade nativa não foi confirmada; `-webkit-font-smoothing: none` não existe no Windows, então prefira tamanhos inteiros e `font-synthesis: none`). Pendência para a Lívia validar visualmente.
- Texto longo (respostas do Diretor, logs) fica em Pixelify Sans 16/24 com `max-width: 64ch`. Código e terminal em mono do sistema (fonte pixel prejudica leitura de código).
- **Texto no mapa e zoom**: rótulos de placa são desenhados em fonte de 8 px "de mundo". Com zoom 2×/3×/4× viram 16/24/32 px na tela. Regra: o zoom permitido é 2×, 3× ou 4× (como no pedido), então o menor rótulo de mundo nunca fica abaixo de 16 px na tela; plaquinhas de NPC ao passar o mouse são HTML em 14–16 px independentes do zoom.
- Fontes **locais** (arquivos WOFF2 versionados, `font-display: swap`, subconjunto latim com acentos do português), nunca CDN em produção (CA-82). Os mockups usam Google Fonts só por conveniência.
- Hierarquia: Título de painel 20 px/700 · Rótulo 14 px/700 caixa normal · Corpo 16 px/400 · Número grande (medidor) 24 px/700 · Placa Silkscreen 16 px.

---

## 6. Iconografia de status (sprites)

Ícones de status são sprites **8×8 inner + contorno de 1 px (`#3B2A20` no mapa; `#1F1A17` no HUD) = 10×10 px**, pixel perfeito, exibidos em múltiplos inteiros (no HUD 20×20 = 2×). Pairing sempre com texto equivalente no cartão (CA-72). Precedência: `!` > ⚙ > ☕ > 💤.

Desenho sugerido (`#` = pixel preenchido; `c` = cor secundária):

```
Engrenagem (trabalhando)  Xícara (pausa)      Zzz (parado há muito)   Exclamação (precisa de você)
..#..#..                  .#..#...            ######..                ...##...
.######.                  ..#..#..            ...##...                ...##...
.##..##.                  .#####..            ..##....                ...##...
###..###                  .#ccc###            ######..                ...##...
###..###                  .#ccc#.#            .....###                ...##...
.##..##.                  .#ccc###            ......#.                ........
.######.                  ..###...            .....#..                ...##...
..#..#..                  .#####..            .....###                ...##...
```

| Ícone | Cor de preenchimento | Animação (normal) | Animação (reduced-motion) |
|---|---|---|---|
| ⚙ trabalhando | `#78B0F5` | gira 4 quadros, 1 volta/1,2 s | parado (1 quadro) |
| ☕ pausa | corpo `#F6EBDD`, café `#C8643F`, vapor `#D4C3B0` | vapor sobe 2 quadros | parado |
| 💤 parado | `#BCA3EE` | Z sobe e some, 2 s | parado |
| ! precisa de você | `#F2685A` com brilho `#FFD84D` | pula 3 px, 600 ms, `steps(3)` | parado, 1 px maior |
| ▲ atenção (limite) | `#F2C94C` | — | — |

Também: coração (mascotes) 8×8 `#F2685A`; "plim" visual (estrela 8×8 `#FFD84D`) junto ao som; ícones de ferramenta (teclado, lupa, terminal, livro) 8×8 em balão sobre o NPC ao trabalhar. Os glifos ⚙ ☕ 💤 do pedido são **sprites**, não emoji de fonte (emoji muda por sistema e viola o estilo).

---

## 7. Animações do HUD e `prefers-reduced-motion`

| Animação | Normal | Reduced-motion |
|---|---|---|
| Gaveta abre/fecha | desliza 160 ms `steps(4)` | aparece/some direto |
| Painel inferior | sobe 160 ms | direto |
| Aba troca | sem animação (já é instantâneo) | igual |
| Barra do medidor | preenchimento muda em 240 ms `steps(6)` | direto |
| Medidor crítico (>95 %) | alterna cor 1 Hz | sem piscar: borda dupla fixa + ícone "!!" |
| Novo cartão em "Precisa de você" | entra 160 ms + borda vermelha pulsa 2× | entra direto, borda fixa |
| Feed de atividade | linha nova com destaque que some em 2 s | linha nova sem destaque animado, com marcador "novo" fixo até ser vista |
| Máquina de escrever (balões e chat) | 30 caracteres/s | texto inteiro de uma vez |
| Toast | entra e some em 4 s | idem, sem deslize |
| Confete, chuva, mascotes correndo, partículas | ligados | desligados ou poses estáticas (CA-22, CA-73, CA-76) |

O app lê `prefers-reduced-motion` no carregamento e ao mudar. Existe ainda a opção em Configurações "Reduzir movimento" (liga o mesmo comportamento mesmo sem a preferência do sistema).

---

## 8. Estados padrão de componentes

Aplicam a todos os controles; detalhes por componente em `COMPONENTES.md`.

| Estado | Regra visual |
|---|---|
| Normal | fundo `bg-700`, contorno `border-strong`, sombra px1 |
| Hover | fundo `#4A3F38` (levemente mais claro), cursor pointer; **não** é o único indicador de ação |
| Foco (teclado) | anel duplo (`--focus-ring`), nunca removido |
| Ativo/pressionado | desce 2 px (sombra some), fundo `bg-800` |
| Selecionado | borda esquerda 4 px na cor do departamento/primária + marcador textual (`aria-selected`/`aria-pressed`) |
| Desabilitado | texto `text-disabled`, sem sombra, `aria-disabled`, cursor padrão |
| Erro | borda 2 px `#F2685A` + ícone "!" + mensagem em `danger-text` abaixo (nunca só cor) |
| Carregando | esqueleto: blocos `bg-700` com varredura lenta (parada em reduced-motion); texto "Carregando…" para leitores de tela |

---

## 9. Mapa e personagens (resumo)

Detalhes em `MAPA.md` (andar de 64×52 tiles, ajustado dos ~60×40 do pedido) e `PERSONAGENS.md` (16 + Freelancer + 2 mascotes). Tile 16×16, personagem 16×32, mascote 16×16, zoom inteiro, sem desfoque.

---

## 10. Pontos de atenção (riscos de design)

1. **Pacote de arte não decidido.** Sem a decisão do Carlos (`ASSETS.md`), a arte final não começa; os mockups usam blocos de cor.
2. **Fonte pixel e leitura longa.** Respostas longas do Diretor em fonte pixel cansam; se Carlos reclamar, trocar só o corpo do chat para uma sans legível (decisão 8).
3. **Mapa de 64×52 é maior que 60×40.** Foi preciso para caber todas as salas com corredores; o minimapa e o foco por sala compensam.
4. **Contrastes calculados à mão.** Reconferência por script pela Teresa antes de congelar.
5. **Segundo monitor 24 h.** Piscar e animação contínua cansam: tudo contínuo é lento e pausa na aba oculta; o Modo TV reduz efeitos opcionais.

---

## 11. Decisões que dependem do Carlos

| # | Decisão | Minha recomendação | Impacto |
|---|---|---|---|
| 1 | **Nome do estúdio** (parede da Recepção e barra superior) | — (ainda não informado; "Estúdio Carlos" é placeholder visível) | texto na barra e arte da placa |
| 2 | **Combinação de arte** (A gratuita CC0 / B mista / C paga; ver `ASSETS.md`) | B se o repositório for privado; A se for público | custo, prazo e se o repo pode ser público |
| 3 | **O repositório será público no GitHub?** | — | define quais pacotes pagos são permitidos |
| 4 | **Música lo-fi**: usar faixas CC0 curtas, CC-BY com atribuição, ou nenhuma por ora | CC0 + 1 CC-BY (Kevin MacLeod) com crédito na tela "Créditos" | CREDITS e escolha das faixas |
| 5 | **Aprovar a lista de nomes completos e cargos** (cabe ao Artur propor; Bianca já usa os apelidos) | — | fichas em `PERSONAGENS.md` |
| 6 | **Aparência dos NPCs** (as fichas são sugestões; ajustar gênero, cabelo, idade) | aprovar com ajustes | arte dos 16 |
| 7 | **Tema claro do HUD** além do escuro | só escuro agora | esforço de tokens |
| 8 | **Fonte do corpo do chat**: Pixelify Sans (identidade) ou sans legível (conforto) | Pixelify 16 px; revisar após 1 semana de uso | legibilidade |
| 9 | **Tamanho do mapa 64×52** em vez de 60×40 | aprovar | arte do mapa |
| 10 | **Zoom padrão**: 2× (em 1920×1080 aparecem cerca de 60×33 tiles; o andar de 64×52 exige arrastar/seguir NPC/minimapa) ou 3× (mais detalhe, mais rolagem) | 2× | câmera inicial |
| 11 | **Sons**: usar efeitos CC0 (Kenney) para interface e digitação; coffee machine sem fonte CC0 confirmada (gravar/gerar) | aprovar | `ASSETS.md` |
