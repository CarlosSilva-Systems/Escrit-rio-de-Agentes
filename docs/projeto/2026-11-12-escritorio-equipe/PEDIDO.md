# Pedido original do Carlos — "Escritório da Equipe" (fonte da verdade)

> Transcrição fiel do pedido de 2026-11-12. Todos os agentes devem ler este arquivo. Tamanho: **G**.

Chefe, novo projeto de tamanho G: "Escritório da Equipe". É um painel web em pixel art que é ao mesmo tempo (1) o escritório virtual onde a nossa equipe de agentes vive, (2) o lugar de onde eu faço meus pedidos, (3) o acompanhamento em tempo real das tarefas e (4) o medidor de consumo do meu limite do Claude Code.
Siga o fluxo G completo: analista, arquiteto e designer-ux montam o PLANO.md e o design; você me apresenta o resumo e espera minha aprovação antes de construir. Entregue em fases e peça meu OK no fim de cada fase.

## 1. Base técnica
- Partir de uma cópia do Pixel Agents (github.com/pablodelucca/pixel-agents, licença MIT), que já funciona no meu Windows com hooks. Manter a licença e os créditos.
- O arquiteto decide, com ADR, se mantém o Canvas 2D do Pixel Agents ou migra a renderização para PixiJS ou Phaser por causa das animações e da iluminação.
- Rodar no Windows, só em 127.0.0.1, com token de acesso, na porta 3200 durante o desenvolvimento (o Pixel Agents atual continua na 3100 até a fase final).
- Leve: até 30 fps, pausar a animação quando a aba estiver oculta, pouco uso de CPU com a aba aberta o dia inteiro. Sem gasto de tokens por padrão.
- Interface em pt-BR e en (padrão pt-BR).

## 2. Pedidos direto pelo painel (substitui o Claude Desktop no dia a dia)
- Painel "Falar com o Diretor": caixa de chat, eu escolho o projeto (lista das subpastas da minha pasta "7 - DEV" + botão "Novo projeto", que cria a pasta), escrevo o pedido e acompanho a resposta do chefe em tempo real.
- Histórico de conversas por projeto, com opção de retomar uma sessão anterior (--resume).
- IMPORTANTE (custo): o "claude -p" e o Agent SDK, nos planos de assinatura, consomem um crédito mensal separado do Agent SDK, e não o meu limite interativo. Por isso:
  - Modo padrão "Sessão interativa": o servidor abre sessões normais do Claude Code (claude com o agente chefe) num pseudo-terminal (node-pty no Windows/ConPTY). O chat envia o texto para essa sessão, e a resposta aparece formatada. Inclua uma aba "Terminal" (xterm.js) com a sessão crua, para eu ver tudo.
  - Modo alternativo "Automático" (claude -p com stream-json): só se eu ativar, com aviso claro de que usa o crédito do Agent SDK.
  - A pesquisadora deve confirmar nas docs atuais como cada modo é cobrado. Me mostre a conclusão antes da fase 2.
- Caixa de entrada "Precisa de você": pedidos de permissão e aprovações de plano aparecem como cartões com os botões Aprovar / Negar / Ver detalhes. Use o hook PermissionRequest esperando minha resposta pelo painel por um tempo limite; se eu não responder, cai no fluxo normal de permissão do Claude. Notificação sonora e do navegador quando algo precisar de mim.
- Funcionar também com sessões abertas pelo Claude Desktop: o escritório e as tarefas aparecem de qualquer jeito, mesmo quando o chat não foi aberto pelo painel.
- Segurança (o pentester precisa testar antes da entrega): só 127.0.0.1, token obrigatório, verificação de Origin/CSRF nas rotas que executam ações, pastas de projeto restritas à "7 - DEV", nenhum comando arbitrário vindo do navegador além das mensagens para o Claude.

## 3. Tarefas em tempo real
- Fonte de dados: tabela de tarefas do docs/projeto/*/PLANO.md de cada projeto (lida com file watcher) + eventos das listas de tarefas do Claude (ferramentas de todo/tarefas nos hooks) + SubagentStart/SubagentStop.
- Visual:
  - cartão por projeto com barra de progresso (% concluído), fase atual e tamanho (P/M/G);
  - quadro kanban (A fazer / Em andamento / Em revisão / Concluída / Bloqueada) com o rosto do NPC responsável em cada cartão;
  - checklist de entregáveis e Definition of Done do PLANO.md;
  - linha do tempo do projeto (planejado → aprovado → construção → qualidade → docs → PR pronto).
- Clicar numa tarefa destaca e segue com a câmera o NPC que está trabalhando nela.
- Ao concluir o projeto: animação de comemoração no escritório (confete, todos batem palmas na sala do projeto).

## 4. Medidor de limite do Claude Code
- Barras de uso das janelas de 5 horas e de 7 dias (used_percentage) com contagem regressiva até o reset (resets_at), no estilo de barra de vida de jogo: verde até 60%, amarelo até 85%, vermelho acima disso, piscando acima de 95%.
- Fonte: o JSON que o Claude Code envia para a statusLine (campo rate_limits, disponível no Pro/Max depois da primeira resposta). Criar um script de statusLine (Node, sem dependências) que mostra uma linha útil no terminal E grava o último valor em ~/.claude/equipe/uso.json para o painel ler. Configurar sem apagar nada que já exista no meu settings.json. Se existir spend_limit ou janela por modelo, mostrar também.
- Complemento: contagem de tokens por projeto, por agente e por dia a partir dos JSONL em ~/.claude/projects/ (gráfico simples de barras), para eu ver quem gasta mais.
- Se o Claude Desktop não alimentar a statusLine, mostrar "atualizado há X min" com o último valor conhecido. A pesquisadora deve verificar isso.
- Alerta no painel quando passar de 80% e de 95%.

## 5. Equipe sempre presente
- Todos os agentes do ~/.claude/equipe/QUADRO.md ficam no escritório o tempo todo, como NPCs fixos.
- Arquivo ~/.claude/equipe/escritorio.json (criado pelo arquiteto): para cada agente, nome técnico, nome completo, cargo, departamento, sprite, mesa e frases. Proponha nomes completos e cargos para os 16 agentes, mantendo os apelidos (Alice, Artur, Bianca, Lívia, Bruno, Otávio, Eduardo, Rafael, Teresa, Rita, Sérgio, Pedro, Gabriela, Davi, Paula) e um nome para o chefe ("Diretor de Projetos"). Quero aprovar a lista.
- Atualize a skill rh-equipe para que toda contratação, ajuste ou desligamento também atualize o escritorio.json. Novo contratado aparece numa mesa livre do departamento certo, com uma pequena cena de "boas-vindas".
- Mouse sobre o NPC: cartão com nome completo, cargo, departamento, status (parado / trabalhando em <tarefa> no projeto <pasta> / aguardando aprovação) e há quanto tempo.
- Clique no NPC: painel com histórico recente, tarefas atuais e tokens gastos hoje.
- agent_type desconhecido (general-purpose ou contratado ainda fora da configuração): NPC temporário "Freelancer" com crachá de visitante.

## 6. Comportamento dos NPCs
- Parado: rotina natural e variada entre a mesa, a máquina de café, as conversas na copa, o banheiro (entra e sai, sem detalhes), a janela, o terraço e o fliperama. Intervalos aleatórios; nunca todos fazendo a mesma coisa ao mesmo tempo.
- Conversas e fofocas em balões de fala em pt-BR, com efeito de máquina de escrever:
  - frases pré-escritas por cargo e personalidade (sem custo de tokens);
  - frases geradas a partir de eventos reais recentes, por exemplo: "Viu que a Teresa achou 2 bugs no Sites?", "O Otávio tá migrando módulo de novo...", "A Gabriela devolveu meu commit, acredita?", "O Diretor aprovou o projeto novo!";
  - geração por IA só como opção desligada por padrão, com aviso de custo.
- Trabalhando (SubagentStart com agent_type): o NPC anda até a sala do projeto e se senta à mesa de reunião, ou fica na mesa dele, conforme configuração. Animação conforme a ferramenta: digitando (Edit/Write), lendo (Read/Grep), rodando comando (Bash, com mini-terminal brilhando), pesquisando (Web, com livro). Ao terminar (SubagentStop), comemora rapidinho e volta à rotina.
- Chefe: vai para a sala do projeto quando há sessão ativa; quando delega, aparece um balão "Lívia, preciso de você!" e o NPC chamado vai até ele.
- Aguardando aprovação: ícone "!" pulando sobre a cabeça; o NPC espera na porta da Diretoria.
- Ícone de status sobre cada NPC: ⚙ trabalhando, ☕ pausa, 💤 parado há muito tempo, ! precisa de você.
- Mascotes do escritório: um Lulu da Pomerânia laranja e um filhote de golden retriever que passeiam, seguem NPCs, dormem perto de quem está parado e soltam corações quando clicados.

## 7. Design visual (quero bonito, aconchegante e divertido de olhar)
### Estilo
- Pixel art top-down em 3/4 (estilo Stardew Valley / Gather Town), tiles de 16×16 com zoom inteiro (2×, 3×, 4×), sem desfoque.
- Personagens de 16×32 com 4 direções e animações: andar, sentar, digitar, ler, beber café, conversar, comemorar, bocejar, dormir na cadeira.
- Paleta quente e aconchegante: piso de madeira mel, paredes creme, detalhes em verde-água e terracota, muitas plantas.
- Cada departamento tem uma cor de destaque no tapete, na placa da porta e nos crachás: Diretoria dourado, Planejamento lilás, Engenharia azul, Qualidade/Segurança verde, Entrega laranja, Biblioteca vinho.
- Fontes pixel livres (licença OFL), como "Pixelify Sans" para a interface e "Silkscreen" para placas e crachás.
- O designer-ux entrega o guia visual (paleta com contraste verificado, tokens, componentes da interface) e mockups antes da construção.

### Mapa (um andar grande, cerca de 60×40 tiles; o designer pode ajustar)
| Linha | Salas |
|---|---|
| Superior | Diretoria · Sala de reunião · Planejamento |
| Meio | Engenharia · Qualidade · Sala SOC (segurança) |
| Corredor | Plantas, bebedouro e quadro de avisos |
| Inferior | Salas de projeto (4 vagas dinâmicas) · Entrega · Biblioteca |
| Térreo | Recepção · Copa · Banheiros · Terraço |

### Detalhes de cada sala
- **Recepção:** balcão, logo e nome do estúdio na parede (pergunte o nome que eu quero), sofá de espera e um painel com "Projetos ativos".
- **Diretoria:** mesa grande de madeira, cadeira de couro, estante, janela com a cidade ao fundo, quadro "Metas do mês" (que mostra de verdade os projetos e o % de cada um) e um troféu.
- **Sala de reunião:** mesa longa, TV na parede mostrando o kanban do projeto mais ativo e um quadro branco.
- **Planejamento:**
  - Alice: quadro de post-its.
  - Artur: prancheta com rolos de planta e um diagrama na parede.
  - Bianca: tablet de desenho e paleta de cores na parede.
- **Engenharia:** mesas com monitores duplos com código brilhando e cabos, além de um patinho de borracha.
  - Otávio: caneca roxa.
  - Eduardo: bancada com protoboard, ferro de solda com fumacinha e osciloscópio piscando.
  - Rafael: bancada com um painel elétrico pequeno, CLP com LEDs, colete e capacete pendurados.
- **Qualidade:** Teresa com lupa, prancheta e um quadro "Bugs encontrados" com contador real; Rita com óculos e pilha de pull requests impressos.
- **Sala SOC (segurança):** ambiente escuro com telões verdes, cadeado gigante na parede e luz azulada. Sérgio de óculos escuros, Pedro de capuz.
- **Entrega:** Gabriela com um quadro mostrando uma árvore de branches colorida (atualizada com o git real do projeto ativo); Davi com estante de manuais e máquina de escrever.
- **Biblioteca:** estantes altas, abajur, globo e escada de livros. Paula fica aqui.
- **Salas de projeto:** criadas sozinhas quando um projeto fica ativo. Placa na porta com o nome da pasta, quadro com as tarefas e barra de progresso no batente. A sala "acende" quando há atividade e escurece quando parada.
- **Copa:** cafeteira com vapor animado, geladeira, máquina de lanches, mesa redonda, sofá, TV, fliperama, mesa de pingue-pongue (NPCs jogam de vez em quando) e janela.
- **Banheiros:** portas simples com placas; os NPCs só entram e saem.
- **Terraço:** plantas, rede, pufes e cordão de luzinhas que acende à noite.
- **Sala de servidores** (pequena, perto da Entrega): racks com LEDs piscando no ritmo da atividade dos agentes.

### Ambiente vivo
- Ciclo dia e noite sincronizado com o horário de Brasília: luz das janelas muda (amanhecer, dia, pôr do sol, noite), luminárias acendem à noite, NPCs bocejam mais tarde da noite.
- Decorações sazonais automáticas: Natal em dezembro (árvore, luzes, gorros nos NPCs), festa junina em junho, Carnaval em fevereiro e marco de aniversário de projeto.
- Chuva ocasional nas janelas. Música lo-fi opcional (play/pause, com faixas livres de direitos) e efeitos sonoros opcionais (teclado, cafeteira, "plim" quando algo precisa de mim).

### Interface (HUD) por cima do escritório
- **Barra superior:** nome do estúdio, relógio, barras de limite de 5h e 7d com o reset, "agentes trabalhando X/16", "projetos ativos", botão de som.
- **Gaveta esquerda — Projetos:** cartões com progresso e fase; clicar centraliza a câmera na sala do projeto.
- **Gaveta direita** (abas): **Chat com o Diretor**; **Precisa de você** (aprovações), com um contador vermelho; **Atividade** (feed em tempo real, com o rosto do NPC em cada linha).
- **Painel inferior recolhível:** kanban de tarefas do projeto selecionado.
- **Navegação:** minimapa no canto, zoom com o scroll e botão "seguir NPC".
- **Modo TV:** tela cheia, sem as gavetas, para deixar num segundo monitor.
- **Celular:** layout responsivo, com o escritório reduzido em cima e as abas em lista embaixo (acesso só local, por enquanto).
- Respeitar prefers-reduced-motion. Atalhos de teclado: C (chat), T (tarefas), A (aprovações), M (mapa).

### Assets
- O designer-ux propõe os pacotes de pixel art (personagens, móveis, interiores) com licença compatível.
- Se a melhor opção for paga (por exemplo, pacotes de interiores modernos no itch.io), me mostre o preço e a licença antes de comprar.
- Personagens: aparência única por agente, coerente com o cargo (o chefe de blazer, o Pedro de moletom com capuz, o Rafael com colete de eletricista, o Eduardo com óculos de proteção, a Bianca com uma caneta no cabelo etc.). Nenhum logo ou personagem de marca registrada.

## 8. Fases (ajuste se achar melhor)
1. **Fundação:** cópia do Pixel Agents rodando na 3200, mapa com todas as salas fixas, NPCs fixos com nomes/cargos/hover, NPC certo trabalhando quando o agente é chamado.
2. **Comando:** chat com o Diretor (modo sessão interativa), caixa "Precisa de você" com aprovações, salas de projeto dinâmicas.
3. **Acompanhamento:** kanban e progresso em tempo real, medidor de limite 5h/7d, tokens por agente e projeto.
4. **Vida:** rotinas de pausa, conversas e fofocas, mascotes, ciclo dia e noite, decorações sazonais, sons, modo TV, versão para celular.
5. **Troca:** substituir o Pixel Agents atual. Ajustar o C:\Users\carlo\pixel-agents\abrir-escritorio.bat e a inicialização do Windows para abrir o novo escritório, com a mesma lógica (liga o servidor se estiver desligado, senão só abre a página), e atualizar o atalho "Escritório dos Agentes".

## 9. Qualidade e entrega
- Testes automatizados da lógica: máquina de estados dos NPCs, mapeamento de eventos para NPCs, leitura de PLANO.md/escritorio.json/uso.json e rotas do servidor.
- Revisão de código, revisão de segurança e pentest antes de cada fase com chat ou aprovações.
- Documentação bilíngue: instalação, uso, como personalizar salas, NPCs, falas e mascotes, e como contratar e já aparecer no escritório.
- Git: repositório novo, commits pela Gabriela, PR pronto por fase. Push só com meu OK.

## Restrições
Não mexa no Pixel Agents instalado nem no abrir-escritorio.bat antes da fase 5. Não instale nada global e não compre nada sem me pedir. Não altere meu settings.json sem me mostrar a mudança antes.
