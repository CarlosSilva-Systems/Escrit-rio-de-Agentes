# Mapa do escritório — planta em tiles

> Autora: Bianca. Data: 2026-11-12. Base: PEDIDO §7 (Mapa e Detalhes de cada sala), §5/§6 (NPCs e comportamento). Tile 16×16 px. Zoom 2×/3×/4× inteiro.
> A planta visual (desenhada a partir dos mesmos dados) está em `mockups/mapa.html`. **Coordenadas desta tabela são a fonte da verdade**; a arte final pode deslocar objetos em ±1 tile sem mudar sala, porta ou assento.

## 0. Ajuste de tamanho: 64×52 tiles (pedido: ~60×40)

Para caber todas as salas pedidas (inclui 4 salas de projeto, sala de servidores, sala de reunião com ≥ 8 assentos, SOC), mais três corredores e as vagas de contratação, o andar ficou **64 colunas × 52 linhas** (1024×832 px a 1×; 2048×1664 a 2×). Os 3 corredores horizontais e 2 passagens verticais evitam congestionamento de NPCs. Se o Carlos preferir 60×40, as salas de projeto passam a 6 tiles e a Copa encolhe; não recomendo.

Convenções
- Origem (0,0) no canto superior esquerdo; x cresce para a direita, y para baixo. `[x1–x2, y1–y2]` inclusivos.
- Cada sala é um retângulo de **piso útil** separado das vizinhas por 1 tile de parede. Paredes **norte** mostram a "face" (2 tiles de altura: as 2 primeiras linhas da sala); a face é decorada (janelas, quadros, estantes) e **não caminhável**. O piso caminhável começa em `y1 + 2`.
- Assento = tile da cadeira (onde fica o pé do personagem). O personagem ocupa o tile do assento e o de cima (16×32). A mesa fica logo abaixo (sul) do assento; o personagem olha para o sul (de frente para o jogador), salvo indicação.
- Porta = 2 tiles de largura (1 tile nos banheiros), passa por toda a espessura da parede/face.
- Ordem de desenho: por y do pé; plaquinhas e balões acima de tudo.

## 1. Planta (1 caractere = 1 tile)

Legenda: `#` parede · `.` corredor/passagem · `+` porta · `g` parede de vidro · Salas: `D` Diretoria · `R` Reunião · `L` Planejamento · `E` Engenharia · `Q` Qualidade · `S` SOC · `1` `2` `3` `4` Salas de projeto · `G` Entrega · `V` Servidores · `B` Biblioteca · `H` Recepção · `W` Banheiros · `C` Copa · `T` Terraço.
As 2 primeiras linhas de cada sala (norte) são a face de parede.

```
   0         1         2         3         4         5         6
   0123456789012345678901234567890123456789012345678901234567890123
00 ################################################################
01 #DDDDDDDDDDDDDDDDD#RRRRRRRRRRRRRRRRRRRRRR#LLLLLLLLLLLLLLLLLLLLL#
02 #DDDDDDDDDDDDDDDDD#RRRRRRRRRRRRRRRRRRRRRR#LLLLLLLLLLLLLLLLLLLLL#
03 #DDDDDDDDDDDDDDDDD#RRRRRRRRRRRRRRRRRRRRRR#LLLLLLLLLLLLLLLLLLLLL#
04 #DDDDDDDDDDDDDDDDD#RRRRRRRRRRRRRRRRRRRRRR#LLLLLLLLLLLLLLLLLLLLL#
05 #DDDDDDDDDDDDDDDDD#RRRRRRRRRRRRRRRRRRRRRR#LLLLLLLLLLLLLLLLLLLLL#
06 #DDDDDDDDDDDDDDDDD#RRRRRRRRRRRRRRRRRRRRRR#LLLLLLLLLLLLLLLLLLLLL#
07 #DDDDDDDDDDDDDDDDD#RRRRRRRRRRRRRRRRRRRRRR#LLLLLLLLLLLLLLLLLLLLL#
08 #DDDDDDDDDDDDDDDDD#RRRRRRRRRRRRRRRRRRRRRR#LLLLLLLLLLLLLLLLLLLLL#
09 #DDDDDDDDDDDDDDDDD#RRRRRRRRRRRRRRRRRRRRRR#LLLLLLLLLLLLLLLLLLLLL#
10 #DDDDDDDDDDDDDDDDD#RRRRRRRRRRRRRRRRRRRRRR#LLLLLLLLLLLLLLLLLLLLL#
11 ########++###################++###################++############
12 #..............................................................#
13 #..............................................................#
14 #EEEEEEEEEEEE++EEEEEEEEEEEE#QQQQQ++QQQQQQQQ#..#SSSSSSSSSSSSSSSS#
15 #EEEEEEEEEEEE++EEEEEEEEEEEE#QQQQQ++QQQQQQQQ#..#SSSSSSSSSSSSSSSS#
16 #EEEEEEEEEEEEEEEEEEEEEEEEEE#QQQQQQQQQQQQQQQ#..#SSSSSSSSSSSSSSSS#
17 #EEEEEEEEEEEEEEEEEEEEEEEEEE#QQQQQQQQQQQQQQQ#..#SSSSSSSSSSSSSSSS#
18 #EEEEEEEEEEEEEEEEEEEEEEEEEE#QQQQQQQQQQQQQQQ#..#SSSSSSSSSSSSSSSS#
19 #EEEEEEEEEEEEEEEEEEEEEEEEEE#QQQQQQQQQQQQQQQ#..#SSSSSSSSSSSSSSSS#
20 #EEEEEEEEEEEEEEEEEEEEEEEEEE#QQQQQQQQQQQQQQQ#..#SSSSSSSSSSSSSSSS#
21 #EEEEEEEEEEEEEEEEEEEEEEEEEE#QQQQQQQQQQQQQQQ#..#SSSSSSSSSSSSSSSS#
22 #EEEEEEEEEEEEEEEEEEEEEEEEEE#QQQQQQQQQQQQQQQ#..#SSSSSSSSSSSSSSSS#
23 #EEEEEEEEEEEEEEEEEEEEEEEEEE#QQQQQQQQQQQQQQQ#..#SSSSSSSSSSSSSSSS#
24 #############++##################++#########..######++##########
25 #..............................................................#
26 #..............................................................#
27 #..............................................................#
28 #..............................................................#
29 #1++1111#2++2222#3++3333#4++4444#..#GG++GGGGGGG#++VVVV#B++BBBBB#
30 #1++1111#2++2222#3++3333#4++4444#..#GG++GGGGGGG#++VVVV#B++BBBBB#
31 #1111111#2222222#3333333#4444444#..#GGGGGGGGGGG#VVVVVV#BBBBBBBB#
32 #1111111#2222222#3333333#4444444#..#GGGGGGGGGGG#VVVVVV#BBBBBBBB#
33 #1111111#2222222#3333333#4444444#..#GGGGGGGGGGG#VVVVVV#BBBBBBBB#
34 #1111111#2222222#3333333#4444444#..#GGGGGGGGGGG#VVVVVV#BBBBBBBB#
35 #1111111#2222222#3333333#4444444#..#GGGGGGGGGGG#VVVVVV#BBBBBBBB#
36 #1111111#2222222#3333333#4444444#..#GGGGGGGGGGG#VVVVVV#BBBBBBBB#
37 #1111111#2222222#3333333#4444444#..#GGGGGGGGGGG#VVVVVV#BBBBBBBB#
38 #################################..#############################
39 #..............................................................#
40 #..............................................................#
41 #H++HHHHHHHHHHHHH#W+WW+W#CCCCCCCCCCCCC++CCCCCCCCCCCCCC#TTTTTTTT#
42 #H++HHHHHHHHHHHHH#W+WW+W#CCCCCCCCCCCCC++CCCCCCCCCCCCCC#TTTTTTTT#
43 #HHHHHHHHHHHHHHHH#WWWWWW#CCCCCCCCCCCCCCCCCCCCCCCCCCCCCgTTTTTTTT#
44 #HHHHHHHHHHHHHHHH#WWWWWW#CCCCCCCCCCCCCCCCCCCCCCCCCCCCCgTTTTTTTT#
45 #HHHHHHHHHHHHHHHH#WWWWWW#CCCCCCCCCCCCCCCCCCCCCCCCCCCCCgTTTTTTTT#
46 #HHHHHHHHHHHHHHHH#WWWWWW#CCCCCCCCCCCCCCCCCCCCCCCCCCCCCgTTTTTTTT#
47 #HHHHHHHHHHHHHHHH#WWWWWW#CCCCCCCCCCCCCCCCCCCCCCCCCCCCC+TTTTTTTT#
48 #HHHHHHHHHHHHHHHH#WWWWWW#CCCCCCCCCCCCCCCCCCCCCCCCCCCCC+TTTTTTTT#
49 #HHHHHHHHHHHHHHHH#WWWWWW#CCCCCCCCCCCCCCCCCCCCCCCCCCCCCgTTTTTTTT#
50 #HHHHHHHHHHHHHHHH#WWWWWW#CCCCCCCCCCCCCCCCCCCCCCCCCCCCCgTTTTTTTT#
51 ########++######################################################
```

Entrada principal do prédio: porta `DR-ENTRADA` na parede sul, `[8–9, 51]`.
Terraço é externo (sem teto): recebe o céu e a luz do ciclo dia/noite inteiros.

## 2. Salas (retângulos de piso, incluindo a face de 2 linhas)

| ID | Sala | Retângulo | Tamanho | Departamento / cor | Centro da câmera ("centralizar") |
|---|---|---|---|---|---|
| DIR | Diretoria | [1–17, 1–10] | 17×10 | Diretoria (dourado) | (9,6) |
| REU | Sala de reunião | [19–40, 1–10] | 22×10 | neutra (verde-água) | (29,6) |
| PLN | Planejamento | [42–62, 1–10] | 21×10 | Planejamento (lilás) | (52,6) |
| ENG | Engenharia | [1–26, 14–23] | 26×10 | Engenharia (azul) | (13,19) |
| QUA | Qualidade | [28–42, 14–23] | 15×10 | Qualidade/Segurança (verde) | (35,19) |
| SOC | Sala SOC (segurança) | [47–62, 14–23] | 16×10 | Qualidade/Segurança (verde, piso escuro) | (54,19) |
| PRJ1 | Sala de projeto 1 | [1–7, 29–37] | 7×9 | cor do projeto (ver §5) | (4,33) |
| PRJ2 | Sala de projeto 2 | [9–15, 29–37] | 7×9 | idem | (12,33) |
| PRJ3 | Sala de projeto 3 | [17–23, 29–37] | 7×9 | idem | (20,33) |
| PRJ4 | Sala de projeto 4 | [25–31, 29–37] | 7×9 | idem | (28,33) |
| ENT | Entrega | [36–46, 29–37] | 11×9 | Entrega (laranja) | (41,33) |
| SRV | Sala de servidores | [48–53, 29–37] | 6×9 | neutra (azul-acinzentado) | (50,33) |
| BIB | Biblioteca | [55–62, 29–37] | 8×9 | Biblioteca (vinho) | (58,33) |
| REC | Recepção | [1–16, 41–50] | 16×10 | neutra (verde-água/terracota) | (8,46) |
| WC | Banheiros | [18–23, 41–50] | 6×10 | neutra | (20,46) |
| COP | Copa | [25–53, 41–50] | 29×10 | neutra, quente | (39,46) |
| TER | Terraço (externo) | [55–62, 41–50] | 8×10 | verde/madeira clara | (58,46) |
| COR1 | Corredor 1 (fila da Diretoria) | [1–62, 12–13] | 62×2 | — | — |
| COR2 | **Corredor principal** (plantas, bebedouro, quadro de avisos) | [1–62, 25–28] | 62×4 | — | (31,26) |
| COR3 | Corredor 3 | [1–62, 39–40] | 62×2 | — | — |
| PAS1 | Passagem norte-sul 1 | [44–45, 14–24] | 2×11 | — | — |
| PAS2 | Passagem norte-sul 2 | [33–34, 29–38] | 2×10 | — | — |

Fluxo: COR1 liga as portas sul das salas superiores às portas norte de ENG/QUA e à PAS1; PAS1 desce a COR2; COR2 dá acesso às portas das fileiras B (sul) e C (norte); PAS2 liga COR2 a COR3; COR3 dá acesso a REC, WC e COP. O Terraço só se acessa pela Copa.

## 3. Portas

| ID | Sala | Tiles | Observação |
|---|---|---|---|
| DR-DIR | Diretoria → COR1 | [8–9, 11] | **"Porta da Diretoria"** (fila de espera por aprovação, §4) |
| DR-REU | Reunião → COR1 | [29–30, 11] | |
| DR-PLN | Planejamento → COR1 | [50–51, 11] | |
| DR-ENG-N | Engenharia ↔ COR1 | [13–14, 14–15] | |
| DR-ENG-S | Engenharia ↔ COR2 | [13–14, 24] | |
| DR-QUA-N | Qualidade ↔ COR1 | [33–34, 14–15] | |
| DR-QUA-S | Qualidade ↔ COR2 | [33–34, 24] | |
| DR-SOC | SOC ↔ COR2 | [52–53, 24] | porta mais escura, com luz azulada |
| DR-PRJ1..4 | Projetos ↔ COR2 | [2–3 / 10–11 / 18–19 / 26–27, 29–30] | placa e barra de progresso no batente |
| DR-ENT | Entrega ↔ COR2 | [38–39, 29–30] | |
| DR-SRV | Servidores ↔ COR2 | [48–49, 29–30] | |
| DR-BIB | Biblioteca ↔ COR2 | [56–57, 29–30] | |
| DR-REC-N | Recepção ↔ COR3 | [2–3, 41–42] | |
| DR-ENTRADA | Rua ↔ Recepção | [8–9, 51] | entrada de contratados e Freelancers |
| DR-WC1 / DR-WC2 | Banheiros ↔ COR3 | [19, 41–42] / [22, 41–42] | 1 tile; NPC entra e some (sem cena dentro) |
| DR-COP | Copa ↔ COR3 | [38–39, 41–42] | |
| DR-TER | Copa ↔ Terraço (vidro) | [54, 47–48] | porta de vidro deslizante |

Placas de porta: Silkscreen 8 px de mundo, sobre o tile superior da face, centralizadas na porta (4×1 tiles; nas salas de projeto 7×1 tiles), cor `base` do departamento e texto `on` (contrastes na seção 4.2 do guia visual).

## 4. A "porta da Diretoria" e a fila de aprovação

- A porta é `DR-DIR` [8–9, 11]. Uma sineta (ícone "!" fixo 8×8) fica acima do batente quando há aprovação pendente.
- **Fila de espera**: 8 posições em COR1, em linha para a direita: `FILA-1` (9,12), `FILA-2` (10,12), `FILA-3` (11,12), `FILA-4` (12,12), `FILA-5` (13,12), `FILA-6` (14,12), `FILA-7` (15,12), `FILA-8` (16,12). Os NPCs ficam virados para o oeste/porta. O NPC com "!" pulando espera na posição livre mais próxima da porta; a linha y=13 do corredor permanece livre para a passagem de outros NPCs.
- Excedente (mais de 8 pendências simultâneas): os demais aguardam em suas mesas com o "!" sobre a cabeça.
- Ao decidir/expirar: o NPC sai da fila e volta ao estado anterior (CA-71).

## 5. Salas de projeto dinâmicas (4 vagas)

Geometria igual nas 4 (a = coluna inicial: 1, 9, 17, 25):

| Elemento | Posição |
|---|---|
| Porta (norte) | [a+1…a+2, 29–30] |
| Quadro de tarefas na face | [a+3…a+6, 29–30] |
| Placa com o nome da pasta (faixa suspensa 7×1) | [a…a+6, 28] (tile de corredor acima da porta, desenhada por cima; até 16 caracteres, depois "…") |
| Barra de progresso | no batente da porta, 2 tiles × 4 px, cor do estado do medidor |
| Mesa 3×2 | [a+2…a+4, 34–35] |
| 6 assentos | superiores (virados ao sul) `y=33`, x = a+2, a+3, a+4; inferiores (virados ao norte) `y=36`, x = a+2, a+3, a+4 |
| Luminária | (a+6, 31) |
| Planta | (a, 31) |

Assentos: `PRJ1-1…PRJ1-6` = (3,33) (4,33) (5,33) (3,36) (4,36) (5,36); `PRJ2-1…6` = (11,33) (12,33) (13,33) (11,36) (12,36) (13,36); `PRJ3-1…6` = (19,33) (20,33) (21,33) (19,36) (20,36) (21,36); `PRJ4-1…6` = (27,33) (28,33) (29,33) (27,36) (28,36) (29,36).

Estados: **vaga livre** (sala escura, placa "LIVRE"/"FREE" em cinza); **ativa** (acende, placa com nome da pasta, quadro mostra tarefas, barra de progresso); **parada** (escurece após 10 min, CA-43). Sem sala livre: o projeto entra na lista "+N projetos" e o NPC trabalha na mesa dele.
A cor de destaque do tapete de cada sala de projeto vem de uma paleta rotativa fixa (verde-água `#4FB3A5`, terracota `#C8643F`, mostarda `#C9962A`, ameixa `#7C4A8A`) escolhida pela vaga, não pelo projeto, para evitar confusão com as 6 cores de departamento (sem texto colorido).

## 6. Mesas e assentos por agente

Padrão de mesa 3×2 tiles: assento em (cx, y) e mesa em [cx−1…cx+1, y+1…y+2], salvo bancadas. IDs: `<SALA>-NN` fixo por agente, `<SALA>-Vn` vaga livre.

| Assento | Quem | Posição do assento | Mesa/bancada | Objeto de destaque na mesa |
|---|---|---|---|---|
| DIR-00 | Diretor de Projetos (chefe) | (9,4) | mesa grande de madeira [7–11, 5–6] | cadeira de couro; nameplate |
| DIR-V1, DIR-V2 | visitantes | (8,8), (10,8) virados ao norte | — | cadeiras de visita |
| PLN-01 | Alice | (45,5) | [44–46, 6–7] | post-its na mesa |
| PLN-02 | Artur | (51,5) | [50–52, 6–7] | prancheta + rolos de planta |
| PLN-03 | Bianca | (57,5) | [56–58, 6–7] | tablet de desenho |
| PLN-V1 | vaga | (61,5) | [60–62, 6–7] | — |
| ENG-01 | Lívia | (3,17) | [2–4, 18–19] | monitores duplos |
| ENG-02 | Bruno | (7,17) | [6–8, 18–19] | monitores duplos + patinho de borracha |
| ENG-03 | Otávio | (11,17) | [10–12, 18–19] | caneca roxa |
| ENG-04 | Eduardo | (17,17) | bancada [15–19, 18–19] | protoboard, ferro de solda (fumacinha), osciloscópio piscando |
| ENG-05 | Rafael | (23,17) | bancada [22–24, 18–19] | CLP com LEDs; painel elétrico na face [21–25, 14–15]; cabide de colete e capacete (26,17) |
| ENG-V1…V3 | vagas | (3,21), (7,21), (11,21) | [2–4 / 6–8 / 10–12, 22–23] | — |
| QUA-01 | Teresa | (31,17) | [30–32, 18–19] | lupa, prancheta |
| QUA-02 | Rita | (36,17) | [35–37, 18–19] | pilha de pull requests impressos |
| QUA-V1, V2 | vagas | (31,21), (36,21) | [30–32 / 35–37, 22–23] | — |
| SOC-01 | Sérgio | (50,17) | [49–51, 18–19] | console com 2 telas |
| SOC-02 | Pedro | (55,17) | [54–56, 18–19] | notebook com adesivos (sem marcas) |
| SOC-V1 | vaga | (60,17) | [59–61, 18–19] | — |
| ENT-01 | Gabriela | (37,32) | [36–38, 33–34] | monitor com git |
| ENT-02 | Davi | (41,32) | [40–42, 33–34] | máquina de escrever |
| ENT-V1 | vaga | (45,32) | [44–46, 33–34] | — |
| BIB-01 | Paula | (59,33) | [58–60, 34–35] | pilha de livros, abajur |
| BIB-V1 | poltrona de leitura (vaga) | (57,36) virada a leste | abajur (56,36) | — |
| REU-01…06 | cadeiras superiores | (24,5) (26,5) (28,5) (30,5) (32,5) (34,5) viradas ao sul | mesa longa [23–36, 6–7] | |
| REU-07…12 | cadeiras inferiores | (24,8) (26,8) (28,8) (30,8) (32,8) (34,8) viradas ao norte | | |
| REU-13, REU-14 | cabeceiras | (22,6) virada a leste; (37,6) virada a oeste | | |
| PRJ1-1…PRJ4-6 | 24 assentos de projeto | ver §5 | | |
| FL-D1, FL-D2 | **mesas provisórias de Freelancer/contratado sem mesa** | (2,45), (14,45) | [1–3, 46–47], [13–15, 46–47] | crachá de visitante na mesa |
| FL-S1, FL-S2 | sofá de espera (Freelancer aguardando) | (13,49), (14,49) viradas ao norte | sofá [12–15, 49–50] | |

Totais: 16 agentes fixos + **9 vagas livres** (PLN 1, ENG 3, QUA 2, SOC 1, ENT 1, BIB 1) + 2 mesas provisórias na Recepção + 2 lugares no sofá (Freelancer) + 14 cadeiras na reunião (**≥ 8 exigido**) + 24 assentos nas salas de projeto.
Regra de contratação (CA-21): novo agente ocupa a primeira vaga livre (`-Vn`) do departamento; sem vaga, usa `FL-D1`/`FL-D2` e o painel avisa. Diretoria não tem vaga (só o Diretor); departamento novo = sala nova (decisão do Carlos). Cena de boas-vindas: entra por `DR-ENTRADA`, para no balcão (8,47), recebe o aceno do Diretor e dos mascotes e caminha até a mesa.

## 7. Objetos e quadros vivos por sala

Notação `[x1–x2, y1–y2]`; "face" = linhas norte da sala.

| Sala | Objetos (posição) | Dados reais ligados |
|---|---|---|
| **Recepção** | balcão [5–10, 45–46]; logo e nome do estúdio na face [6–11, 41–42]; **painel "Projetos ativos"** na face [12–15, 41–42]; sofá de espera [12–15, 49–50]; planta alta (16,43); vitrine de vidro na parede sul [3–6, 51] e [11–14, 51]; tapete verde-água [4–11, 43–44] | painel: lista dos projetos ativos com %; nome do estúdio vem da configuração |
| **Diretoria** | mesa grande [7–11, 5–6]; cadeira de couro (9,4); estante na face [1–4, 1–2]; **janela com a cidade** na face [6–12, 1–2]; **quadro "Metas do mês"** na face [13–16, 1–2]; troféu (16,4); tapete dourado [5–13, 4–9]; luminária (15,6); plantas (1,9) (16,9) | Metas do mês: projetos reais e % de cada um |
| **Sala de reunião** | mesa longa [23–36, 6–7]; **TV** na face [26–33, 1–2]; **quadro branco** na face [20–24, 1–2]; janela na face [35–39, 1–2]; 14 cadeiras (§6); plantas (20,9) (39,9) | TV mostra o kanban do projeto mais ativo |
| **Planejamento** | **post-its** na face [43–47, 1–2]; **diagrama** de arquitetura na face [49–53, 1–2]; **paleta de cores** na face [55–59, 1–2]; janela na face [60–62, 1–2]; mesa de plantas (rolos) [53–55, 9–10]; sofá de brainstorm [44–47, 9–10]; tapete lilás [43–61, 4–8] | — (decoração; post-its podem mostrar tarefas "A fazer" do projeto ativo, opcional) |
| **Engenharia** | monitores com código brilhando nas mesas [2–12, 18–19]; cabos no chão (decoração); **patinho de borracha** no monitor do Bruno; bancada de eletrônica [15–19, 18–19]; **painel elétrico** na face [21–25, 14–15]; cabide com colete e capacete (26,17); estante de peças (14,16); janela lateral na parede oeste (0, 16–19); tapete azul [1–13, 16–23]; plantas (1,23) (26,23) | — |
| **Qualidade** | **quadro "Bugs encontrados"** na face [38–41, 14–15]; mesas [30–32 / 35–37, 18–19]; estante de relatórios (29,16); tapete verde [29–41, 16–23] | contador real de bugs encontrados (por projeto ativo) |
| **Sala SOC** | piso escuro; **telões verdes** na face [47–56, 14–15]; **cadeado gigante** na face [58–61, 14–15]; consoles [49–51 / 54–56, 18–19]; luz azulada (zona SOC); porta mais escura | pode mostrar estado de segurança do projeto ativo (opcional, fase 4) |
| **Entrega** | estante de manuais na face [36–37, 29–30]; **quadro "árvore de branches"** na face [41–46, 29–30]; máquina de escrever (41,33); mesas [36–38 / 40–42 / 44–46, 33–34]; tapete laranja [37–46, 31–36] | árvore colorida atualizada com o git real do projeto ativo |
| **Sala de servidores** | racks na face [50–53, 29–30] (2 racks); racks laterais (53, 32–33) e (53, 35–36); piso elevado; ponto de serviço (50,33) | LEDs piscam no ritmo da atividade dos agentes |
| **Biblioteca** | **estantes altas** na face [58–62, 29–30] e coluna leste [62, 33–37] e oeste [55, 33–37]; abajur (61,35); globo (57,34); escada de livros (61, 31–32); mesa [58–60, 34–35]; poltrona de leitura (57,36); tapete vinho [56–61, 31–37] | — |
| **Salas de projeto** | ver §5 | placa, quadro de tarefas e barra de progresso reais |
| **Copa** | geladeira na face [26–27, 41–42]; bancada [28–31, 43] com **cafeteira com vapor** (29,43); máquina de lanches na face [33–34, 41–42]; **TV** na face [41–45, 41–42]; sofá [41–45, 45–46]; mesinha [42–44, 43]; **mesa redonda** [33–35, 46–48] com 4 cadeiras; **2 fliperamas** [48–49, 43–44] e [51–52, 43–44]; **mesa de pingue-pongue** [47–51, 47–48]; parede de vidro para o Terraço [54, 43–50]; camas dos mascotes (27,49) e (29,49) e tigela (26,50); plantas (25,43) (53,43) (25,50) | — |
| **Banheiros** | duas portas simples com placa "WC" (19,41–42) e (22,41–42); interior não renderizado | — |
| **Terraço** | rede [57–61, 44]; 3 pufes (57,47) (59,47) (61,47); muitas plantas ao longo de x=62 e y=50; **cordão de luzinhas** de [55,41] a [62,41] e em V até (58,44) (acende à noite); guarda-corpo leste (x=63) e norte (y=41) | — |
| **Corredor 1** | plantas (1,12) (62,12); fila da Diretoria (§4) | — |
| **Corredor 2 (principal)** | **bebedouro** (36,25); **quadro de avisos** [20–23, 25]; plantas (2,25) (14,25) (26,25) (41,25) (48,25) (60,25); bancos (10,27) (50,27); passagens PAS1 e PAS2 | quadro de avisos: avisos do sistema (ex.: "atualização do limite há 2 min") |
| **Corredor 3** | plantas (1,39) (31,39) (62,39); banco (24,40) | — |

## 8. Pontos de interesse (rotinas de NPC parado, §6 do pedido)

| Código | Ponto | Tiles onde o NPC fica | Capacidade | Observação |
|---|---|---|---|---|
| POI-CAFE | Cafeteira | (29,44), (30,44) virados ao norte | 2 | animação "beber café" |
| POI-BEB | Bebedouro | (36,26) | 1 | NPC fica de pé |
| POI-FLIP | Fliperama | (48,45), (51,45) virados ao norte | 2 | jogar |
| POI-PING | Pingue-pongue | (46,47) virado a leste; (52,48) virado a oeste | 2 | jogam de vez em quando |
| POI-JAN | Janela | Copa (53,45) e (53,49); Reunião (37,3); Diretoria (4,3) (só o Diretor); Biblioteca (59,31) | vários | olhar pela janela |
| POI-TER | Terraço | pufes (57,47) (59,47) (61,47); rede (59,44); amurada (60,42) | 5 | tomar ar |
| POI-COPA | Conversa na copa | (32,45) (36,45) (32,49) (36,49) ao redor da mesa redonda; sofá (42,46) (43,46) (44,46) | 7 | balões de fala |
| POI-WC | Banheiros | portas (19,42) e (22,42) | — | NPC entra e some, volta em 20–60 s |
| POI-SOFA-REC | Sofá da Recepção | (13,49), (14,49) | 2 | Freelancers aguardam |
| POI-TV | TV da Copa | sofá (42–44,46) | 3 | assistir |
| POI-MASC | Camas dos mascotes | (27,49), (29,49) | 2 | mascotes dormem |

Rotas: grade de passabilidade (a técnica de busca de caminho é decisão do Artur). Paredes e a face (2 linhas norte de cada sala) são bloqueadas; mesas bloqueadas; cadeiras só acessíveis pelo tile de assento. Largura mínima 1 tile; corredores de 2 a 4 tiles evitam engarrafamento. NPCs andam a ~3 tiles/s (a calibrar).

## 9. Janelas (para o ciclo dia/noite)

| ID | Local | Tiles | Vista |
|---|---|---|---|
| W-01 | Diretoria (face) | [6–12, 1–2] | cidade ao fundo (silhueta de prédios) |
| W-02 | Reunião (face) | [35–39, 1–2] | céu e topo de árvores |
| W-03 | Planejamento (face) | [60–62, 1–2] | céu |
| W-04 | Engenharia (parede oeste, painel lateral) | (0, 16–19) | pátio/árvore |
| W-05 | Biblioteca (parede leste, painel lateral) | (63, 31–32) | árvore |
| W-06 | Recepção (vitrine sul) | [3–6, 51], [11–14, 51] | rua |
| W-07 | Copa → Terraço (parede de vidro) | [54, 43–46] e [54, 49–50] | terraço e céu |
| — | Terraço | a céu aberto | recebe o tom do céu inteiro |
| — | SOC, Qualidade, Entrega, Servidores, salas de projeto, banheiros | sem janela | só luz artificial |

A cada janela W-0x: pintar o céu com `--sky-*` do tom atual e projetar um **feixe de luz** (paralelogramo de 2–3 tiles, 18 % de opacidade) no piso à frente durante amanhecer/dia/entardecer; à noite o vidro mostra estrelas e luzes distantes. Chuva = linhas diagonais nas janelas W-01…W-07 (e no Terraço), desligada em reduced-motion.

## 10. Zonas de luz (acender/escurecer salas)

Cada zona recebe uma **máscara de iluminação** (retângulo suave de 1 tile). Regras: `luz própria` (lâmpadas) acende conforme o tom do dia (noite e, nas salas sem janela, sempre) e conforme a atividade (salas de projeto).

| Zona | Retângulo | Fonte natural | Lâmpadas (centros) | Regra |
|---|---|---|---|---|
| ZL-DIR | [1–17, 1–10] | W-01 | (4,5) (15,6) (9,3) | acende à noite |
| ZL-REU | [19–40, 1–10] | W-02 | (25,3) (31,3) (37,9) | acende à noite e quando há reunião (agentes sentados) |
| ZL-PLN | [42–62, 1–10] | W-03 | (45,4) (51,4) (57,4) | acende à noite |
| ZL-ENG | [1–26, 14–23] | W-04 | (4,16) (12,16) (20,16) | acende à noite; monitores brilham sempre |
| ZL-QUA | [28–42, 14–23] | — | (31,16) (36,16) | sempre acesa (luz fria) |
| ZL-SOC | [47–62, 14–23] | — | telões | **ambiente azul-escuro fixo** (50 % do tom de noite durante o dia) |
| ZL-PRJ1…4 | cada sala de projeto | — | (a+6,31) + quadro | **acesa só com atividade**; escurece após 10 min parada (CA-43) |
| ZL-ENT | [36–46, 29–37] | — | (40,31) (45,31) | sempre acesa |
| ZL-SRV | [48–53, 29–37] | — | LEDs | penumbra azul; LEDs sempre ligados |
| ZL-BIB | [55–62, 29–37] | W-05 | abajur (61,35); (57,34) | à noite só o abajur e a luminária (clima aconchegante) |
| ZL-REC | [1–16, 41–50] | W-06 | (4,44) (13,44) | acende à noite |
| ZL-WC | [18–23, 41–50] | — | — | sem render |
| ZL-COP | [25–53, 41–50] | W-07 | (30,43) (43,43) (50,45) | acende à noite; fliperamas brilham sempre |
| ZL-TER | [55–62, 41–50] | céu | cordão de luzinhas | **sem teto**: segue o tom do céu; cordão acende às 18:30 |
| ZL-COR1/2/3 | corredores | — | a cada 8 tiles | meia luz fixa; ganha 15 % de brilho se houver NPC trabalhando |

Níveis: `acesa` (nenhuma sobreposição extra), `penumbra` (+`rgba(14,10,20,0.20)`), `apagada` (+`rgba(14,10,20,0.35)`).

## 11. Mascotes

Camas: Lulu (27,49), golden (29,49). Rotas: passeiam pelos corredores e pela Copa, seguem NPCs, dormem perto de quem está parado (a ≤ 2 tiles de um assento ocupado por NPC parado) e soltam coração ao clique. Nunca entram na SOC nem nas salas de projeto fechadas. Não bloqueiam NPC (passam por baixo na ordem de desenho e se afastam).

## 12. Decorações sazonais (ganchos de arte)

Pontos de ancoragem fixos para decoração (só desenhar, sem lógica): árvore de Natal na Recepção (3,44) e Copa (26,46); luzes de Natal em todas as faces norte; bandeirinhas de festa junina em COR2 de x=2 a x=61 em y=25; serpentinas e máscaras de Carnaval na Copa; bolo e balões na sala do projeto no aniversário.

## 13. Pontos a validar na construção

1. Face de 2 tiles nas paredes norte reduz o piso caminhável (Engenharia fica com 8 linhas; Row C com 7): conferir se as mesas nos 2 tiles inferiores cabem sem colidir com o sprite 16×32 do assento seguinte. A planta foi calculada para isso, mas a arte final pode exigir deslocar 1 tile.
2. Distância longa entre Diretoria (x=8) e a Qualidade/SOC: se a caminhada passar de ~25 s, considerar uma 2ª passagem em x=27–28.
3. Planta e objetos foram desenhados antes de existir a arte escolhida (decisão pendente em `ASSETS.md`); dimensões de móveis são "módulos de tile", independentes do pacote.
