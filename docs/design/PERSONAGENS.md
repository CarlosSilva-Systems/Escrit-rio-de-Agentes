# Personagens — fichas visuais

> Autora: Bianca. Data: 2026-11-12. Base: PEDIDO §5, §6, §7 (Assets/Personagens), QUADRO.md (16 agentes).
> São **sugestões de aparência** para o Carlos aprovar. Os nomes completos e cargos oficiais são propostos pelo Artur (`escritorio.json`); aqui uso apelido + função do QUADRO.
> Regras gerais: aparências **diversas e respeitosas** (idades, tons de pele, cabelos, corpos e estilos variados; nenhum estereótipo ligado ao cargo); **nenhum logo, marca ou personagem de marca registrada** (camisetas só com formas genéricas: engrenagem, chave, folha); cada um é reconhecível pela **silhueta** a 1× e pelo **acessório** a 2×.

## 1. Especificação técnica comum

| Item | Valor |
|---|---|
| Quadro (célula) | 16×32 px (corpo ~14 px de largura, ~30 px de altura; sombra de piso no último tile) |
| Direções | S (frente), N (costas), E; **W é espelho de E** (reduz arte pela metade; cabelo e acessório assimétricos devem funcionar espelhados; exceções marcadas "assimétrico: arte própria para W") |
| Contorno | 1 px `#3B2A20`, interno sem contorno preto puro |
| Cores | até 14 cores por personagem, em paleta indexada |
| Crachá | área 3×3 px no peito (S e E) em cor-chave `#FF00FF`, trocada pela cor `light` do departamento ao carregar (permite recolorir sem redesenhar); costas (N) mostram cordão |
| Retrato (feed e kanban) | 16×16 px do rosto/cabeça (frame idle S, linhas 0–15), com moldura de 1 px na cor do departamento e **fundo** `#3A312C`; expressão alternativa "alerta" (sobrancelha levantada) opcional |
| Sobreposições sazonais | camada separada: gorro de Natal, chapéu de festa junina, máscara/confete de Carnaval (mesma grade 16×32) |
| Cor do departamento | usar `light` no crachá; cores em `GUIA-VISUAL.md` §2.2 |
| Paleta de pele (sugerida) | `#F5D0B0` · `#E3B48A` · `#C68B59` · `#9A6240` · `#6B4226` · `#4A2C1A` |

### 1.1 Lista de animações e frames

Quadros únicos por personagem (com W espelhado de E). Direções: S, N, E.

| Animação | Direções | Frames/direção | Total | Fase |
|---|---|---|---|---|
| Parado em pé (idle, respiração) | S, N, E | 2 | 6 | 1 |
| Andar | S, N, E | 4 | 12 | 1 |
| Sentar (sentado, parado) | S, N, E | 1 | 3 | 1 |
| Digitar (sentado) | S, N, E | 2 | 6 | 1 |
| Ler (sentado/segurando livro ou papel) | S, N, E | 2 | 6 | 1 |
| Acenar (boas-vindas, "preciso de você") | S | 2 | 2 | 4 |
| Beber café | S, E | 3 | 6 | 4 |
| Conversar (gesto com a mão) | S, E | 2 | 4 | 4 |
| Comemorar (braços para cima) | S | 4 | 4 | 4 (comemoração rápida no SubagentStop já na fase 1 como 2 frames) |
| Bocejar | S | 3 | 3 | 4 |
| Dormir na cadeira | S | 2 | 2 | 4 |
| Jogar fliperama (de costas) | N | 2 | 2 | 4 |
| Jogar pingue-pongue | E | 2 | 2 | 4 |
| **Total** | | | **58 quadros** | |

Ferramentas (CA-69): digitar = "Digitar"; ler = "Ler"; Bash = "Digitar" + mini-terminal brilhando (objeto separado sobre a mesa); pesquisar = "Ler" + livro (objeto); desconhecida = "Digitar" lento. O mini-terminal e o livro são sprites de objeto, não do personagem.
Ícones de status (⚙ ☕ 💤 !) são sprites separados, ancorados 2 px acima da cabeça (ver `GUIA-VISUAL.md` §6).

### 1.2 Layout da folha de sprites (por personagem)

Grade **14 colunas × 5 linhas** de células 16×32 = **224 × 160 px**. Células vazias reservadas.

| Linha | Conteúdo (colunas entre parênteses, a partir de 0) |
|---|---|
| 0 Andar | andar S (0–3), andar N (4–7), andar E (8–11); 12–13 livres |
| 1 Parado/Sentar | idle S (0–1), idle N (2–3), idle E (4–5), sentar S (6), sentar N (7), sentar E (8), acenar S (9–10); 11–13 livres |
| 2 Trabalho | digitar S (0–1), N (2–3), E (4–5); ler S (6–7), N (8–9), E (10–11); 12–13 livres |
| 3 Vida | café S (0–2), café E (3–5), conversar S (6–7), conversar E (8–9), bocejar S (10–12); 13 livre |
| 4 Eventos | comemorar S (0–3), dormir S (4–5), fliperama N (6–7), pingue-pongue E (8–9); 10–13 livres |

Folha de **retrato**: 16×16 por personagem em atlas separado (16 + Freelancer + 2 mascotes = 19 células). Folha de **mascotes**: grade 12 colunas × 3 linhas de 16×16 (ver §4).

## 2. Equipe fixa (16)

Legenda de cores: P = pele, C = cabelo, R1/R2 = roupa principal/secundária. Departamento = cor do crachá (`light`).

| # | Quem | Dept. (crachá) | Idade e traços | Silhueta (a 1×) | Paleta (HEX) | Acessório e detalhe |
|---|---|---|---|---|---|---|
| 1 | **Diretor de Projetos** (chefe) | Dourado `#EDBE45` | ~45 anos, pele média, cabelo curto com fios grisalhos nas têmporas | ombros largos e retos (blazer), a figura mais "quadrada" | P `#C68B59` · C `#3A3A40` · R1 blazer azul-marinho `#2C3E66` · R2 camisa creme `#F3E6CC` · calça `#5B5B66` · sapato `#4A3326` | crachá dourado maior (4×4), lenço de bolso terracota; segura um tablet fino ao "acenar"; sem gravata |
| 2 | **Alice** (analista) | Lilás `#BCA3EE` | ~32, pele `#E3B48A`, cabelo preto liso, franja reta | cardigã longo desenhando um "A" | P `#E3B48A` · C `#1F1A22` · R1 cardigã mostarda `#D9A441` · R2 camiseta branca `#F6EBDD` · calça jeans `#4B6585` | bloco de post-its coloridos (amarelo/rosa/verde-água) no bolso e na mão |
| 3 | **Artur** (arquiteto) | Lilás `#BCA3EE` | ~50, pele clara, cabelo e barba curta grisalhos | tubo de planta cruzando o corpo na diagonal | P `#F5D0B0` · C `#9A9A9A` · R1 camisa azul-clara arregaçada `#8FB4D9` · R2 colete cinza `#5E6470` · calça cáqui `#B59A73` | **rolo de planta** (tubo `#D4C3B0` com tampa terracota) sob o braço; régua no bolso |
| 4 | **Bianca** (designer-ux) | Lilás `#BCA3EE` | ~28, pele `#9A6240`, cabelo cacheado volumoso em **coque alto** | coque alto e redondo no topo | P `#9A6240` · C `#2B1B14` · R1 macacão terracota `#C8643F` · R2 camiseta creme `#F3E6CC` · tênis verde-água `#4FB3A5` | **caneta verde-água atravessada no cabelo**; tablet de desenho na mão ao digitar; assimétrico: coque visível em E (W espelhado serve) |
| 5 | **Lívia** (dev-web) | Azul `#78B0F5` | ~26, pele clara com sardas, cabelo ruivo em rabo de cavalo | rabo de cavalo balançando | P `#F5D0B0` · C `#A8512B` · R1 moletom azul-petróleo `#2F5E73` · R2 calça preta `#2A2A30` · tênis brancos | **fone de ouvido grande** no pescoço; adesivo de "folha" no notebook |
| 6 | **Bruno** (dev-backend) | Azul `#78B0F5` | ~35, pele `#6B4226`, cabeça raspada, barba bem aparada | cabeça lisa + ombros largos | P `#6B4226` · C `#1A1410` (barba) · R1 jaqueta jeans `#4B6585` · R2 camiseta cinza com engrenagem `#8A8A92` · calça preta | **headset** de um lado; patinho de borracha amarelo `#F2C94C` no monitor |
| 7 | **Otávio** (dev-odoo) | Azul `#78B0F5` | ~40, pele `#E3B48A`, cabelo castanho com entradas, barba rala | segura algo à altura do peito (caneca) | P `#E3B48A` · C `#5A3A28` · R1 polo cinza-azulado `#6C7A89` · R2 calça cáqui `#B59A73` | **caneca roxa** `#6A3FA0` sempre na mão (quando parado e ao "beber café" usa a própria) |
| 8 | **Eduardo** (dev-embarcados) | Azul `#78B0F5` | ~30, pele `#C68B59`, cabelo preto curto espetado | jaleco branco curto, "campânula" | P `#C68B59` · C `#1F1A17` · R1 jaleco branco `#F6EBDD` · R2 camiseta preta `#2A2A30` · calça cinza `#5E6470` | **óculos de proteção** transparentes na testa (lentes `#9FD8E8`, tira cinza); ferro de solda no bolso; fumacinha ao "digitar" |
| 9 | **Rafael** (dev-automacao) | Azul `#78B0F5` | ~45, pele `#9A6240`, bigode e cabelo curto grisalho | **colete** quadrado com listras horizontais | P `#9A6240` · C `#8A8A8A` · R1 colete de eletricista amarelo-limão `#D7E23B` com faixas prateadas `#D4C3B0` · R2 camiseta cinza `#8A8A92` · calça azul-marinho `#2C3E66` · botas `#4A3326` | colete (também pendurado na bancada) e **capacete branco** `#F6EBDD` pendurado; luvas no cinto |
| 10 | **Teresa** (testador-qa) | Verde `#6FCF7C` | ~38, pele `#C68B59`, cabelo castanho curto cacheado (bob) | braço estendido com lupa | P `#C68B59` · C `#3A2418` · R1 cardigã verde-musgo `#3E7A5A` · R2 camiseta branca · calça jeans `#4B6585` | **lupa** dourada `#C9962A` na mão; prancheta na outra; ao "ler" aproxima a lupa |
| 11 | **Rita** (revisor-codigo) | Verde `#6FCF7C` | ~55, pele clara, cabelo grisalho curto | cabeça com armação grande e redonda | P `#F5D0B0` · C `#B5B5B5` · R1 blusa listrada creme/verde-água `#F3E6CC`/`#4FB3A5` · R2 saia longa `#5E6470` | **óculos de armação grande terracota** `#C8643F`; pilha de PRs impressos (papéis com carimbos) |
| 12 | **Sérgio** (revisor-seguranca) | Verde `#6FCF7C` | ~42, pele `#4A2C1A`, cabeça raspada, barba cheia | figura escura e vertical | P `#4A2C1A` · C `#1A1410` · R1 terno preto `#24262C` · R2 camisa cinza-escura `#44506A` | **óculos escuros** pretos (formato aviador genérico, sem marca); fone de ouvido discreto; contorno 1 px mais claro `#5A4A40` para destacar na SOC |
| 13 | **Pedro** (pentester) | Verde `#6FCF7C` | ~24, pele `#E3B48A`; cabelo coberto pelo capuz (mecha azul escapando `#4A7BD0`) | **capuz levantado** (cabeça triangular), bolso canguru | P `#E3B48A` · C `#4A7BD0` (mecha) · R1 moletom cinza-azulado `#44506A` · R2 calça preta · tênis cinza | **moletom com capuz**, sem estampa no peito; notebook com adesivos de formas (cadeado, olho) |
| 14 | **Gabriela** (git-github) | Laranja `#F59F45` | ~34, pele `#9A6240`, tranças longas presas em meio rabo | tranças em movimento | P `#9A6240` · C `#1A1410` · R1 camisa jeans `#5B7FA6` · R2 colete de lã creme `#F3E6CC` · calça preta | **pin de ramificação** (3 pontos coloridos ligados) na lapela; caneca branca; etiquetas de versão no monitor |
| 15 | **Davi** (documentador) | Laranja `#F59F45` | ~29, pele `#E3B48A`, cabelo loiro-escuro ondulado, barba por fazer | **suspensórios** em X nas costas, livro sob o braço | P `#E3B48A` · C `#8A6A3A` · R1 camisa creme `#F3E6CC` · R2 suspensórios marrons `#7A4A2A` · calça cinza `#5E6470` | livro azul-petróleo `#2F5E73` sob o braço; lápis atrás da orelha |
| 16 | **Paula** (pesquisador) | Vinho `#E58AA5` | ~60, pele `#C68B59`, cabelo grisalho prateado curto | xale em "V" sobre os ombros | P `#C68B59` · C `#CFCFD6` · R1 xale vinho `#8E2F4B` · R2 blusa verde-escura `#2F6B3A` · saia `#5E6470` | **óculos meia-lua** com correntinha; livro aberto ao "ler"; pilha de livros |

Hierarquia de reconhecimento a 1×: (1) silhueta (blazer, capuz, jaleco, colete, tubo, coque, rabo de cavalo, tranças), (2) cor do crachá, (3) acessório. Nenhum par tem a mesma silhueta **e** a mesma cor de roupa principal.

### Nome nas telas
Rosto (retrato 16×16) + apelido (Pixelify Sans) + cargo curto; crachá com cor do departamento. Em cartões do HUD o rosto nunca aparece sem o nome ao lado (acessibilidade).

## 3. Freelancer (visitante) e outros

| Item | Descrição |
|---|---|
| Quem | NPC temporário para `agent_type` desconhecido (general-purpose ou contratado ainda sem configuração) |
| Aparência | corpo neutro com **3 variações sorteadas** (tons de pele e cabelo diferentes), camiseta cinza-creme `#D4C3B0`, jaqueta bege `#B59A73`, calça cinza `#5E6470` |
| Crachá | **crachá de visitante** grande (5×4 px) creme `#F6EBDD` com tarja cinza no topo, preso por cordão; sem cor de departamento; texto "VISITANTE" (pt-BR) / "VISITOR" (en) em Silkscreen no cartão de hover |
| Detalhe | pequena etiqueta "?" quando o `agent_type` é desconhecido |
| Animações | as mesmas 58 quadros; só uma folha base com as 3 variações pelo recolor de pele/cabelo |
| Entrada/saída | surge pela porta `DR-ENTRADA`, vai à mesa provisória `FL-D1/FL-D2` ou à sala do projeto; some pela mesma porta após o Stop |
| Retrato | silhueta com "?" |

Sazonais: gorro de Natal vermelho `#D64545` com pompom `#F6EBDD` (todos os NPCs e mascotes em dezembro); chapéu de palha e xadrez nos ombros em junho; confete e pequena máscara no Carnaval. Camada separada, 16×32.

## 4. Mascotes (16×16)

| Mascote | Descrição | Paleta | Animações |
|---|---|---|---|
| **Lulu** (Pomerânia laranja) | bolinha de pelo com cauda enrolada sobre as costas, focinho pequeno, orelhas pontudas pequenas; pelagem **laranja** | pelo `#E8903A`, claro `#F5B461`, peito/focinho `#F6EBDD`, nariz `#2A2320`, contorno `#3B2A20` | andar S/N/E (3 quadros), correr E (3), sentar (2), dormir enrolada (2), alegre/pular (2), coração |
| **Golden filhote** | filhote de golden retriever: patas grandes, orelhas caídas, pelagem **dourada** | pelo `#D9A441`, claro `#EBC873`, sombra `#B07F2C`, nariz `#2A2320`, língua `#E08A5F` | andar S/N/E (3), correr E (3), sentar (2), dormir deitado (2), alegre/rabo abanando (2), coração |
| Coração (partícula) | 8×8, sobe 12 px e some em 800 ms | `#F2685A` com brilho `#FFD84D` | com reduced-motion: coração estático por 1 s |

Grade: 12 colunas × 3 linhas de 16×16 por mascote (andar S 0–2 / N 3–5 / E 6–8; correr E 9–11; linha 1: sentar S 0–1, sentar E 2–3, dormir 4–5, alegre 6–7, livre 8–11; linha 2 livre para futuros mascotes/itens).
Os dois têm tamanhos diferentes: Lulu ocupa ~12×12 px na célula (menor), golden ~14×14; ambos com sombra de piso.

## 5. Produção das 16 variações

Estratégia detalhada em `ASSETS.md`: base modular (CC0 ou paga) + redesenho dos acessórios únicos (lupa, tubo de planta, capuz, colete, jaleco, óculos de proteção, caneta no coque, caneca roxa) e dos mascotes do zero. Reserva de revisão de arte: o Carlos deve aprovar uma folha de teste com **3 personagens** (chefe, Bianca, Pedro) antes de produzir os outros 13.
