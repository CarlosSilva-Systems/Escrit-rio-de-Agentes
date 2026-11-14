# Requisitos — Escritório da Equipe (projeto G)

> Autora: Alice (analista). Data: 2026-11-12. Fonte da verdade: `PEDIDO.md` (citado como "pedido §N"). Equipe: `~/.claude/equipe/QUADRO.md` (16 agentes: chefe + 15).
> Esta seção alimenta "Requisitos" do `PLANO.md`. Não define stack, arquitetura nem visual (Artur e Bianca); só registra restrições vindas do pedido.
> Itens marcados **[depende de pesquisa X]** têm o CA escrito para valer nos dois cenários da resposta.
> Pesquisas em andamento (não bloqueiam este documento): **P1** cobrança dos modos do Claude; **P2** statusLine/rate_limits (e Desktop); **P3** hooks (PermissionRequest, SubagentStart/Stop, tarefas); **P4** Pixel Agents (código/licença).

---

## 1. Objetivo, público e problema

**Objetivo.** Painel web em pixel art, local, que reúne em um só lugar: (1) o escritório virtual onde os 16 agentes "vivem"; (2) o ponto de onde o Carlos faz pedidos e aprova permissões; (3) o acompanhamento em tempo real de projetos e tarefas; (4) o medidor do limite de uso do Claude Code.

**Público.** Um único usuário: Carlos (dev full-stack, Windows 11, uso local em 127.0.0.1). Não há multiusuário, cadastro, nuvem nem acesso remoto.

**Problema.** Hoje o Carlos (a) não vê, de relance, quem da equipe está fazendo o quê; (b) precisa alternar entre Claude Desktop, terminal e pastas para pedir, aprovar e acompanhar; (c) só descobre que o limite de 5h/7d está acabando quando é bloqueado; (d) não sabe quem consome mais tokens. O Pixel Agents atual (porta 3100) mostra agentes, mas não cobre pedidos, aprovações, tarefas nem limite.

**Resultado de negócio.** Menos trocas de contexto, aprovações sem perder tempo, nenhum bloqueio surpresa por limite, e um ambiente agradável de deixar aberto o dia todo, sem gastar tokens por padrão.

### 1.1 Métricas de sucesso (objetivas; valores são metas propostas, ajustáveis na pergunta PA-13)

| ID | Métrica | Meta | Como medir |
|---|---|---|---|
| M-01 | Taxa de quadros | ≤ 30 fps (teto), ≥ 24 fps sustentados com 16 NPCs + 2 mascotes + 4 salas + chuva | contador de fps do app, 5 min |
| M-02 | CPU do processo do navegador (aba visível, escritório ocioso, 1 h) | média ≤ 5% de 1 núcleo | Gerenciador de Tarefas / `typeperf`, janela de 10 min |
| M-03 | CPU com aba oculta | média ≤ 1% de 1 núcleo; 0 fps de renderização | idem |
| M-04 | CPU do servidor Node ocioso | média ≤ 2% de 1 núcleo; memória estável (crescimento < 50 MB em 8 h) | idem |
| M-05 | Latência evento → NPC (hook SubagentStart recebido até o NPC iniciar a ação) | p95 ≤ 1 s, máx. 2 s | timestamp do hook vs. do render, 50 eventos |
| M-06 | Latência de aprovação (cartão aparece após PermissionRequest) | p95 ≤ 1 s | idem |
| M-07 | Latência de atualização do PLANO.md (salvar → kanban) | p95 ≤ 2 s | idem |
| M-08 | Tokens gastos pelo próprio escritório por padrão | 0 (nenhuma chamada a `claude -p`/API sem ação explícita do Carlos) | inspeção + teste |
| M-09 | Tempo de "nenhum limite surpresa" | alerta exibido antes de 80% e 95% em 100% das leituras recebidas | teste com fixtures |
| M-10 | Cobertura dos CAs por testes automatizados | 100% dos CAs "Must" com teste ou verificação manual documentada | matriz da Teresa |

---

## 2. Escopo

### 2.1 DENTRO (por fase do pedido §8)

**Fase 1 — Fundação**
- Cópia do Pixel Agents (MIT) como base, créditos e licença preservados; servidor em 127.0.0.1:3200 com token.
- Mapa com todas as salas fixas (pedido §7: Diretoria, Reunião, Planejamento, Engenharia, Qualidade, SOC, Corredor, Entrega, Biblioteca, Recepção, Copa, Banheiros, Terraço, Sala de servidores; 4 vagas de sala de projeto, ainda estáticas/vazias).
- 16 NPCs fixos (`escritorio.json`), com nome/cargo/departamento, cartão de hover, painel de clique (histórico recente e tarefas atuais), Freelancer para `agent_type` desconhecido.
- NPC certo trabalhando quando o agente é chamado (SubagentStart/Stop), inclusive com sessões abertas pelo Claude Desktop.
- i18n pt-BR/en, limite de 30 fps, pausa em aba oculta, `prefers-reduced-motion`, atalhos e acessibilidade básica.
- Atualização da skill `rh-equipe` para manter `escritorio.json` (e cena de boas-vindas).
- Aprovação do Carlos para a lista de nomes completos/cargos (gate).

**Fase 2 — Comando**
- Painel "Falar com o Diretor": escolha de projeto (subpastas de "7 - DEV" + "Novo projeto"), chat, resposta em tempo real, histórico por projeto, retomar (`--resume`).
- Modo padrão "Sessão interativa" (PTY) + aba Terminal (sessão crua); modo "Automático" opcional, desligado, com aviso de custo.
- Caixa "Precisa de você": cartões Aprovar/Negar/Ver detalhes via hook PermissionRequest com timeout e fallback; aprovação de plano; notificação sonora e do navegador.
- Salas de projeto dinâmicas (até 4) que acendem/apagam.
- Segurança: 127.0.0.1, token, Origin/CSRF, restrição a "7 - DEV", sem comando arbitrário; pentest antes da entrega.
- Gate: Carlos recebe a conclusão da pesquisa de cobrança (P1) **antes** de iniciar a fase 2.

**Fase 3 — Acompanhamento**
- Tarefas a partir de `docs/projeto/*/PLANO.md` (watcher), eventos de listas de tarefas do Claude e SubagentStart/Stop; cartão de projeto, kanban de 5 colunas, checklist de entregáveis/DoD, linha do tempo; clicar na tarefa segue o NPC; comemoração ao concluir projeto.
- Medidor 5h/7d (barras estilo vida de jogo), script de statusLine (Node, sem dependências) que grava `~/.claude/equipe/uso.json`, alertas 80%/95%, "atualizado há X min", spend_limit/janela por modelo se existirem.
- Tokens por projeto, agente e dia (JSONL em `~/.claude/projects/`), gráfico de barras.

**Fase 4 — Vida**
- Rotinas de pausa, conversas/fofocas (pré-escritas e baseadas em eventos reais), mascotes, balões com máquina de escrever, ícones de status, animações por ferramenta, ciclo dia/noite (Brasília), decorações sazonais, chuva, música lo-fi e efeitos sonoros opcionais, modo TV, layout responsivo para celular (só acesso local).

**Fase 5 — Troca**
- Substituir o Pixel Agents atual: ajustar `C:\Users\carlo\pixel-agents\abrir-escritorio.bat`, inicialização do Windows e o atalho "Escritório dos Agentes", mantendo a lógica "liga o servidor se desligado, senão só abre a página".
- Documentação bilíngue final, PR final, checagem final de segurança.

**Transversal (todas as fases):** testes automatizados da lógica (máquina de estados dos NPCs, mapeamento evento→NPC, leitura de PLANO.md/escritorio.json/uso.json, rotas do servidor); revisão de código e de segurança por fase; pentest antes de cada fase com chat ou aprovações (2 e, para regressão, 5); documentação bilíngue; repositório novo, commits pela Gabriela, PR por fase, push só com OK do Carlos.

### 2.2 FORA (explícito)

| # | Fora do escopo | Observação |
|---|---|---|
| F-01 | Acesso remoto/celular fora da rede local (túnel, VPN, nuvem, bind em 0.0.0.0, HTTPS público) | Pedido §7 "Celular": "acesso só local, por enquanto". O layout responsivo é só para a tela; o servidor continua em 127.0.0.1 |
| F-02 | Geração de falas por IA como comportamento padrão | Só como opção desligada, com aviso de custo (CA-68). Não há custo de tokens por padrão |
| F-03 | Multiusuário, contas, papéis, login além do token único | Usuário final é só o Carlos |
| F-04 | Alterar o Pixel Agents instalado (porta 3100) ou o `abrir-escritorio.bat` antes da fase 5 | Restrição do pedido |
| F-05 | Instalar qualquer coisa globalmente; comprar assets/música sem aprovação prévia (preço + licença mostrados) | Restrição do pedido |
| F-06 | Alterar `~/.claude/settings.json` sem mostrar o diff e obter OK | Restrição do pedido (CA-20, CA-59) |
| F-07 | Escrever em CLP/hardware real; deploy em servidor; qualquer publicação externa | Fora da natureza do produto |
| F-08 | Executar comandos arbitrários vindos do navegador (só mensagens para o Claude e respostas de aprovação) | Pedido §2 segurança |
| F-09 | Persistir ou exibir conteúdo completo das conversas lidas dos JSONL fora do necessário (ver §5.3) | Privacidade |
| F-10 | Modo "Automático" (`claude -p`) ligado por padrão | Só opt-in com aviso (CA-34) |
| F-11 | Editar o PLANO.md pelo painel (kanban é somente leitura) | Pedido só fala em "ler com file watcher". Arrastar cartões = Won't (PA-07) |
| F-12 | Gerar/gerenciar arte própria além do mapa/NPCs listados; marcas registradas ou personagens de terceiros | Pedido §7 Assets |
| F-13 | Apps nativos (Electron, mobile), instalador MSI | Painel web local |
| F-14 | Métricas de custo em R$/US$ calculadas pelo escritório | Só % de limite e contagem de tokens; spend_limit apenas se fornecido pelo Claude Code |
| F-15 | Funcionar em macOS/Linux | Alvo é Windows 11 (portabilidade não é requisito) |
| F-16 | Editor de mapas/NPCs gráfico | Personalização é por arquivos (`escritorio.json`, frases, etc.), documentada |
| F-17 | Suporte a outros agentes/CLIs além do Claude Code | — |

---

## 3. Histórias de usuário por épico

Prioridade MoSCoW (M=Must, S=Should, C=Could, W=Won't nesta entrega). "Fase" = onde entra.

### E1 — Base / Servidor
| ID | História | Prio | Fase |
|---|---|---|---|
| US-01 | Como Carlos, quero abrir o escritório novo na porta 3200 sem afetar o Pixel Agents na 3100, para testar com segurança. | M | 1 |
| US-02 | Como Carlos, quero que só eu acesse (127.0.0.1 + token), para que ninguém na rede mexa nos meus agentes. | M | 1 |
| US-03 | Como Carlos, quero que o painel seja leve e pause quando eu não o estiver vendo, para deixá-lo aberto o dia todo. | M | 1 |
| US-04 | Como Carlos, quero a interface em pt-BR (padrão) e en, para trocar de idioma quando precisar. | M | 1 |
| US-05 | Como Carlos, quero que a licença MIT e os créditos do Pixel Agents e dos assets sejam preservados, para respeitar os autores. | M | 1 |

### E2 — Chat e Pedidos
| ID | História | Prio | Fase |
|---|---|---|---|
| US-06 | Como Carlos, quero escolher um projeto (subpasta de "7 - DEV") ou criar um novo, para dirigir o pedido ao lugar certo. | M | 2 |
| US-07 | Como Carlos, quero escrever o pedido e ver a resposta do Diretor em tempo real, para não precisar abrir o Claude Desktop. | M | 2 |
| US-08 | Como Carlos, quero ver o histórico por projeto e retomar uma sessão anterior, para continuar de onde parei. | M | 2 |
| US-09 | Como Carlos, quero uma aba Terminal com a sessão crua, para ver tudo que o Claude está fazendo. | S | 2 |
| US-10 | Como Carlos, quero que o modo padrão use meu limite interativo e que o modo Automático só ligue com aviso de custo, para não gastar o crédito do Agent SDK sem querer. | M | 2 |
| US-11 | Como Carlos, quero que sessões abertas pelo Claude Desktop também apareçam no escritório, para ter visão única. | M | 1–2 |

### E3 — Aprovações
| ID | História | Prio | Fase |
|---|---|---|---|
| US-12 | Como Carlos, quero cartões "Precisa de você" com Aprovar/Negar/Ver detalhes, para decidir permissões sem trocar de janela. | M | 2 |
| US-13 | Como Carlos, quero que, se eu não responder a tempo, o Claude siga o fluxo normal de permissão, para nada travar. | M | 2 |
| US-14 | Como Carlos, quero aviso sonoro e do navegador quando algo precisar de mim, para não perder aprovações. | M | 2 |
| US-15 | Como Carlos, quero aprovar planos (plan mode) pelo painel. | S | 2 |

### E4 — Tarefas / Kanban
| ID | História | Prio | Fase |
|---|---|---|---|
| US-16 | Como Carlos, quero um cartão por projeto com % concluído, fase e tamanho, para ver o andamento de relance. | M | 3 |
| US-17 | Como Carlos, quero um kanban (A fazer / Em andamento / Em revisão / Concluída / Bloqueada) com o rosto do responsável, para saber quem faz o quê. | M | 3 |
| US-18 | Como Carlos, quero ver checklist de entregáveis, DoD e linha do tempo do projeto. | S | 3 |
| US-19 | Como Carlos, quero clicar numa tarefa e a câmera seguir o NPC que trabalha nela. | S | 3 |
| US-20 | Como Carlos, quero uma comemoração quando um projeto concluir. | C | 3 |

### E5 — Medidor de limite
| ID | História | Prio | Fase |
|---|---|---|---|
| US-21 | Como Carlos, quero barras de 5h e 7d com contagem regressiva ao reset, para saber quanto ainda posso usar. | M | 3 |
| US-22 | Como Carlos, quero alertas aos 80% e 95%. | M | 3 |
| US-23 | Como Carlos, quero saber há quanto tempo o dado foi atualizado quando o Desktop não alimentar a statusLine. | M | 3 |
| US-24 | Como Carlos, quero um script de statusLine que mostre uma linha útil no terminal e alimente o painel, sem apagar minha configuração atual. | M | 3 |
| US-25 | Como Carlos, quero ver tokens por projeto, agente e dia, para saber quem gasta mais. | S | 3 |
| US-26 | Como Carlos, quero ver spend_limit e janelas por modelo, se existirem. | C | 3 |

### E6 — Equipe / NPCs
| ID | História | Prio | Fase |
|---|---|---|---|
| US-27 | Como Carlos, quero todos os 16 agentes presentes como NPCs fixos com nome completo, cargo e departamento, e aprovar a lista de nomes. | M | 1 |
| US-28 | Como Carlos, quero um cartão ao passar o mouse (nome, cargo, depto, status e há quanto tempo). | M | 1 |
| US-29 | Como Carlos, quero um painel ao clicar (histórico recente, tarefas atuais, tokens de hoje). | M | 1 (tokens: 3) |
| US-30 | Como Carlos, quero que `agent_type` desconhecido apareça como "Freelancer" com crachá de visitante. | M | 1 |
| US-31 | Como Carlos, quero que contratar/ajustar/desligar via `rh-equipe` atualize o escritório automaticamente, com cena de boas-vindas. | M | 1 |

### E7 — Comportamento
| ID | História | Prio | Fase |
|---|---|---|---|
| US-32 | Como Carlos, quero ver o NPC certo trabalhando (animação por ferramenta) e comemorando ao terminar. | M | 1 (básico) / 4 (animações por ferramenta) |
| US-33 | Como Carlos, quero rotinas de pausa naturais e variadas quando parados. | S | 4 |
| US-34 | Como Carlos, quero balões com conversas pré-escritas e baseadas em eventos reais, sem custo de tokens. | S | 4 |
| US-35 | Como Carlos, quero opção (desligada) de falas geradas por IA com aviso de custo. | C | 4 |
| US-36 | Como Carlos, quero ver o chefe delegando ("Lívia, preciso de você!") e o NPC aguardando aprovação na porta da Diretoria com "!". | S | 4 (o "!" básico entra na 2) |
| US-37 | Como Carlos, quero ícones de status (trabalhando, pausa, parado, precisa de você). | S | 4 (precisa de você: 2) |
| US-38 | Como Carlos, quero dois mascotes (Lulu laranja e golden filhote) interativos. | C | 4 |

### E8 — Mapa e arte
| ID | História | Prio | Fase |
|---|---|---|---|
| US-39 | Como Carlos, quero um andar grande (~60×40 tiles) com todas as salas e objetos temáticos do pedido §7. | M (salas e NPCs) / S (objetos de detalhe) | 1 |
| US-40 | Como Carlos, quero salas de projeto que surjam sozinhas quando um projeto ficar ativo, com placa, quadro e progresso. | M | 2 |
| US-41 | Como Carlos, quero quadros vivos (Metas do mês, Bugs encontrados, árvore de branches do git, painel de projetos ativos, TV com kanban). | S | 3 (dados) |
| US-42 | Como Carlos, quero estilo pixel art 16×16, personagens 16×32 com 4 direções e animações listadas, paleta quente e cores por departamento. | M | 1–4 |
| US-43 | Como Carlos, quero ver preço e licença antes de qualquer compra de assets. | M | 1 |

### E9 — HUD
| ID | História | Prio | Fase |
|---|---|---|---|
| US-44 | Como Carlos, quero barra superior (nome do estúdio, relógio, barras 5h/7d, agentes X/16, projetos ativos, som). | M | 1 (estrutura), 3 (barras) |
| US-45 | Como Carlos, quero gaveta de Projetos e gaveta direita com abas Chat / Precisa de você (contador) / Atividade. | M | 2–3 |
| US-46 | Como Carlos, quero painel inferior recolhível com o kanban do projeto selecionado. | M | 3 |
| US-47 | Como Carlos, quero minimapa, zoom por scroll e "seguir NPC". | S | 1 |
| US-48 | Como Carlos, quero atalhos C, T, A, M. | S | 2–3 |
| US-49 | Como Carlos, quero um Modo TV em tela cheia para segundo monitor. | C | 4 |
| US-50 | Como Carlos, quero layout responsivo para celular (acesso só local). | C | 4 |

### E10 — Ambiente vivo
| ID | História | Prio | Fase |
|---|---|---|---|
| US-51 | Como Carlos, quero ciclo dia/noite no horário de Brasília. | S | 4 |
| US-52 | Como Carlos, quero decorações sazonais automáticas (Natal, festa junina, Carnaval, aniversário de projeto). | C | 4 |
| US-53 | Como Carlos, quero chuva ocasional nas janelas. | C | 4 |
| US-54 | Como Carlos, quero música lo-fi e efeitos sonoros opcionais, desligados por padrão. | C | 4 |

### E11 — Troca final
| ID | História | Prio | Fase |
|---|---|---|---|
| US-55 | Como Carlos, quero que o `abrir-escritorio.bat`, a inicialização do Windows e o atalho abram o novo escritório com a mesma lógica de hoje. | M | 5 |
| US-56 | Como Carlos, quero poder voltar ao Pixel Agents antigo se algo der errado (rollback). | S | 5 |
| US-57 | Como Carlos, quero documentação bilíngue (instalar, usar, personalizar salas/NPCs/falas/mascotes, contratar e aparecer). | M | 1–5 (final: 5) |

---

## 4. Critérios de aceite

Convenção: "pasta DEV" = a pasta "7 - DEV" do Carlos (caminho exato em PA-05). "Token" = segredo de acesso local. Valores numéricos em *itálico* são sugestões (ver perguntas); os demais vêm do pedido.

### Fase 1 — Fundação

**CA-01 (US-01, Must)** Dado o servidor iniciado em modo desenvolvimento, quando eu listo os sockets em escuta, então existe escuta em `127.0.0.1:3200` e **não** existe escuta em `0.0.0.0:3200` nem em endereço de rede local.
**CA-02 (US-01, Must)** Dado que a porta 3200 já está ocupada, quando o servidor inicia, então ele encerra com mensagem clara (pt-BR/en) indicando a porta e o processo ocupante, e **não** troca de porta silenciosamente nem usa a 3100.
**CA-03 (US-02, Must)** Dado o servidor rodando, quando faço uma requisição HTTP (página, API ou WebSocket) sem token ou com token errado, então recebo 401 (ou fechamento do WebSocket) e nenhum dado; com token correto recebo 200. O token é gerado aleatoriamente com ≥ 128 bits de entropia, comparado em tempo constante, e não aparece em logs.
**CA-04 (US-01, Must)** Dado o Pixel Agents instalado (porta 3100), quando a fase 1–4 é construída e executada, então os arquivos do Pixel Agents instalado e o `abrir-escritorio.bat` têm hash idêntico ao do início do projeto e a 3100 continua funcionando normalmente em paralelo.
**CA-05 (US-05, Must)** Dado o repositório novo, quando inspeciono a raiz, então existem o arquivo `LICENSE` MIT do Pixel Agents com o copyright original preservado, um `NOTICE`/`CREDITS` bilíngue citando o projeto de origem (pablodelucca/pixel-agents) e todos os assets/fontes/músicas com autor, licença e URL, e a interface tem uma tela "Créditos".
**CA-06 (US-03, Must)** Dado o escritório visível com NPCs animados, quando meço a renderização por 60 s, então o número de quadros renderizados por segundo é ≤ 30 em todas as amostras.
**CA-07 (US-03, Must)** Dado o escritório visível, quando a aba fica oculta (troca de aba/minimizar), então a animação e o laço de renderização pausam (0 quadros renderizados) e a lógica de simulação não acumula "tempo perdido" (NPCs não teletransportam); ao voltar, retoma em ≤ 500 ms com estado correto.
**CA-08 (US-03, Must)** Dado o escritório ocioso com 16 NPCs por 10 min, quando meço CPU, então a média do navegador é ≤ *5%* de 1 núcleo com aba visível e ≤ *1%* com aba oculta (M-02/M-03), e o servidor ≤ *2%* (M-04).
**CA-09 (US-03, Must)** Dado a configuração padrão, quando uso o escritório por 1 h, então nenhuma chamada a `claude -p`, ao Agent SDK ou a APIs pagas é feita, e nenhuma requisição de rede sai da máquina (exceto o que o Carlos acionar explicitamente) (M-08).
**CA-10 (US-04, Must)** Dado a primeira abertura, quando carrego a página, então a interface está em pt-BR; quando troco para en nas configurações, então 100% dos textos de interface mudam sem recarregar, a escolha persiste, e um teste automatizado falha se existir chave de tradução presente em um idioma e ausente no outro.
**CA-11 (US-39, Must)** Dado o mapa, quando o percorro, então existem todas as salas fixas: Diretoria, Sala de reunião, Planejamento, Engenharia, Qualidade, Sala SOC, Corredor, Entrega, Biblioteca, Recepção, Copa, Banheiros, Terraço, Sala de servidores e 4 vagas de sala de projeto; cada departamento usa a sua cor de destaque (dourado, lilás, azul, verde, laranja, vinho).
**CA-12 (US-27, Must)** Dado o `escritorio.json` aprovado, quando o escritório carrega, então aparecem exatamente 16 NPCs fixos (chefe "Diretor de Projetos" + 15), cada um na mesa do seu departamento, com nome completo, cargo e apelido corretos; e a lista de nomes/cargos foi aprovada pelo Carlos antes da construção dos NPCs (registro da aprovação no PLANO.md).
**CA-13 (US-27, Must)** Dado um `escritorio.json` ausente, com JSON inválido ou com campo obrigatório faltando, quando o servidor inicia ou o arquivo muda, então o painel mostra um aviso identificando arquivo e campo, mantém o último arquivo válido (ou, sem ele, um conjunto mínimo gerado do QUADRO.md) e não quebra.
**CA-14 (US-28, Must)** Dado um NPC, quando passo o mouse sobre ele (ou foco por teclado), então aparece em ≤ 150 ms um cartão com nome completo, cargo, departamento, status (parado / trabalhando em <tarefa> no projeto <pasta> / aguardando aprovação) e há quanto tempo, e o cartão some ao sair.
**CA-15 (US-32, Must)** Dado um evento SubagentStart com `agent_type` = "dev-web", quando o servidor o recebe, então a Lívia passa a "trabalhando" no escritório em p95 ≤ 1 s (M-05) e o status do cartão mostra o projeto (pasta derivada do `cwd`).
**CA-16 (US-32, Must)** Dado um NPC trabalhando, quando chega SubagentStop correspondente, então o NPC comemora rapidamente e volta à rotina/mesa; dois SubagentStart seguidos do mesmo `agent_type` (instâncias paralelas) mantêm o NPC "trabalhando" até o último Stop.
**CA-17 (US-30, Must)** Dado um SubagentStart com `agent_type` que não está em `escritorio.json` (ex.: "general-purpose" ou contratado ainda sem configuração), quando o evento chega, então surge um NPC temporário "Freelancer" com crachá de visitante, que trabalha normalmente e desaparece após o Stop; se o `escritorio.json` for atualizado com esse tipo, o Freelancer é substituído pelo NPC real sem recarregar a página.
**CA-18 (US-11, Must) [depende de pesquisa P3]** Dado uma sessão iniciada pelo Claude Desktop (não pelo painel), quando agentes são chamados nela, então os NPCs correspondentes aparecem trabalhando no escritório; caso os hooks não se apliquem a sessões do Desktop, o painel exibe um aviso visível "sessões do Desktop não detectadas" e usa como fallback a leitura dos JSONL (atraso máximo documentado).
**CA-19 (US-29, Must)** Dado um NPC, quando clico nele, então abre um painel com histórico recente (últimas ≥ 10 atividades com horário), tarefas atuais e, a partir da fase 3, tokens gastos hoje; fechar com Esc ou clicar fora.
**CA-20 (US-02, Must)** Dado que o escritório precisa de hooks no `settings.json`, quando a instalação é executada, então ela primeiro exibe o diff da mudança, só aplica após meu OK, faz backup datado, e preserva integralmente hooks/chaves já existentes (mescla, nunca sobrescreve); é reversível por um comando documentado.
**CA-21 (US-31, Must)** Dado a skill `rh-equipe` atualizada, quando contrato, ajusto ou desligo um agente, então `escritorio.json` é atualizado junto com o QUADRO.md; um contratado novo aparece em mesa livre do departamento correto com cena de boas-vindas; se não houver mesa livre, aparece em mesa provisória na Recepção e o painel avisa; o desligado sai do escritório com cena de despedida simples; um teste valida que QUADRO.md e `escritorio.json` ficam consistentes.
**CA-22 (US-03, Must)** Dado `prefers-reduced-motion: reduce` no sistema, quando abro o escritório, então animações decorativas (confete, chuva, mascotes correndo, piscadas, partículas) são desativadas ou reduzidas a estados estáticos, NPCs mudam de estado por troca de pose sem caminhada animada contínua, e nada pisca mais de 3 vezes por segundo; as informações (status, alertas) continuam disponíveis em texto/ícone.
**CA-23 (US-48, Should)** Dado o foco fora de campos de texto, quando pressiono C, T, A ou M, então abre/alterna respectivamente Chat, Tarefas, Aprovações e Mapa; com foco num campo de texto essas teclas **não** disparam atalhos; todos os controles da HUD são alcançáveis por Tab com foco visível e operáveis por Enter/Espaço; Esc fecha gavetas/modais.
**CA-24 (US-42, Must)** Dado o guia visual da Bianca, quando auditado, então textos e ícones de informação têm contraste ≥ 4,5:1 (texto normal) e ≥ 3:1 (texto grande/componentes) contra o fundo, em todas as cores de departamento usadas em crachás/placas; a cor nunca é o único indicador de estado (sempre há ícone ou texto).
**CA-25 (Transversal, Must)** Dado o código de lógica, quando rodo a suíte de testes, então existem e passam testes de: máquina de estados dos NPCs, mapeamento evento→NPC (incluindo Freelancer), leitura de PLANO.md, `escritorio.json`, `uso.json` e rotas do servidor, cada teste referenciando o(s) ID(s) de CA que cobre.
**CA-26 (US-43, Must)** Dado a proposta de assets, quando o pacote escolhido for pago ou de licença restritiva, então nenhuma compra/download pago ocorre antes de eu receber nome do pacote, preço, licença (uso comercial/redistribuição/modificação) e fonte, e dar OK explícito.

### Fase 2 — Comando

**CA-27 (US-06, Must)** Dado o seletor de projeto, quando abro o chat, então a lista mostra exatamente as subpastas de primeiro nível da pasta DEV (ordenadas, sem arquivos, sem ocultas/`.git`/`node_modules`), atualizada ao reabrir o seletor.
**CA-28 (US-06, Must)** Dado o botão "Novo projeto", quando informo um nome válido (ex.: "meu-site"), então a pasta é criada dentro da pasta DEV e selecionada; quando informo nome vazio, > 100 caracteres, com `..`, `/`, `\`, `:`, caracteres inválidos do Windows (`<>:"|?*`), nomes reservados (CON, NUL, COM1…), terminando em ponto/espaço, ou já existente, então recebo erro específico e nada é criado.
**CA-29 (US-06, Must)** Dado qualquer rota/mensagem que recebe caminho ou id de projeto, quando enviado um caminho fora da pasta DEV (absoluto, relativo com `..`, UNC, 8.3, junction/symlink apontando para fora, variação de maiúsculas/barras), então a requisição é rejeitada com 403/400 e nada é lido, criado ou executado fora da pasta DEV (a resolução é feita por caminho real canônico).
**CA-30 (Must)** Dado uma requisição que executa ação (enviar mensagem, criar projeto, responder aprovação, alterar configuração), quando o cabeçalho `Origin` está ausente, é de outro host/porta, ou o `Host` não é `127.0.0.1:3200`/`localhost:3200`, ou falta o token anti-CSRF, então é rejeitada com 403; isso vale também para o handshake de WebSocket (proteção contra DNS rebinding e CSRF de páginas de outros sites).
**CA-31 (Must)** Dado o conjunto de rotas, quando inspeciono a API e tento enviar `{"cmd":"..."}`, shell, argumentos extras de CLI ou variáveis de ambiente pelo navegador, então nenhuma rota aceita isso: o servidor só aceita (a) texto de mensagem para uma sessão do Claude, (b) ids de projeto/sessão válidos, (c) decisões de aprovação, (d) configurações de uma lista fechada; o comando `claude` e seus argumentos são montados somente no servidor.
**CA-32 (US-07, Must) [depende de pesquisa P1 para o modo]** Dado o modo padrão "Sessão interativa", quando seleciono um projeto e envio um pedido, então o servidor abre (ou reutiliza) uma sessão normal do `claude` com o agente chefe num pseudo-terminal com `cwd` no projeto, o texto chega à sessão e a resposta aparece formatada (markdown básico, blocos de código) no chat em tempo real, com o primeiro trecho exibido em ≤ 1 s após o texto aparecer na saída da sessão; mensagens enviadas durante uma resposta ficam em fila e são indicadas.
**CA-33 (US-09, Should)** Dado uma sessão aberta pelo painel, quando abro a aba "Terminal", então vejo a sessão crua (cores, redimensionamento) sincronizada com o chat; por padrão a aba é **somente leitura** e só aceita digitação após eu ativar "permitir entrada" explicitamente (sugestão, PA-10); a conexão exige token e Origin como em CA-30.
**CA-34 (US-10, Must)** Dado a configuração padrão, quando uso o chat, então o modo é "Sessão interativa" e o "Automático" está desligado; ao tentar ativar o "Automático", aparece aviso explícito de que usa o crédito mensal do Agent SDK separado do limite interativo [texto final conforme pesquisa P1] e exige confirmação; a ativação é por sessão/projeto e o modo ativo fica sempre visível no chat; sem confirmação nenhuma chamada `claude -p` ocorre.
**CA-35 (US-10, Must)** Dado a fase 2 não iniciada, quando a pesquisa P1 termina, então o Carlos recebe resumo das regras de cobrança de cada modo (com fontes e data) e dá OK antes do início da construção da fase 2 (gate registrado no PLANO.md).
**CA-36 (US-08, Must)** Dado projetos com conversas anteriores, quando abro o histórico de um projeto, então vejo as sessões (data, primeiro pedido resumido, nº de mensagens) ordenadas da mais recente; ao escolher "Retomar", o servidor abre `claude --resume <id>` no `cwd` do projeto e o chat continua a conversa; se o id não existir mais ou pertencer a outro projeto, aparece erro claro e nada é aberto.
**CA-37 (US-12, Must) [depende de pesquisa P3]** Dado um evento PermissionRequest, quando o servidor o recebe, então aparece em ≤ 1 s (M-06) um cartão na caixa "Precisa de você" com agente (NPC), projeto, ferramenta e resumo, botões **Aprovar**, **Negar** e **Ver detalhes** (mostra a entrada completa da ferramenta, com segredos mascarados — §5.3), e o contador vermelho incrementa; ao clicar Aprovar/Negar, a decisão é devolvida ao hook e a sessão segue/é negada conforme a escolha.
**CA-38 (US-13, Must)** Dado um cartão de aprovação pendente, quando passa o tempo limite do hook (padrão *60 s*, configurável — PA-08) sem resposta, então o hook retorna sem decisão para que o Claude use o fluxo normal de permissão, o cartão passa a "expirado — decida no terminal" e deixa de contar no contador vermelho; uma decisão clicada depois do prazo é recusada com mensagem clara e **não** é aplicada.
**CA-39 (US-13, Must)** Dado o servidor do escritório desligado, travado ou inacessível, quando um hook PermissionRequest dispara, então o script do hook falha rápido (≤ *1,5 s*), não bloqueia a sessão do Claude e o fluxo normal de permissão ocorre; o script nunca decide "aprovar" por padrão em caso de erro.
**CA-40 (US-12, Must)** Dado dois cartões do mesmo pedido (duas abas abertas ou duplo clique), quando respondo duas vezes, então apenas a primeira decisão é aplicada; as demais mostram "já respondido"; cada cartão é identificado por id único não adivinhável e vinculado à sessão/ferramenta de origem.
**CA-41 (US-15, Should) [depende de pesquisa P3]** Dado uma aprovação de plano (ExitPlanMode ou equivalente), quando ocorre, então aparece cartão com o plano completo legível e botões Aprovar/Negar (e campo opcional de comentário se o hook permitir); se o mecanismo não puder ser interceptado por hook, o cartão apenas notifica "plano aguardando aprovação no terminal" com ícone "!" no NPC.
**CA-42 (US-14, Must)** Dado uma nova aprovação pendente, quando o cartão surge, então toca um som curto (respeitando mute) e dispara notificação do navegador (se a permissão foi concedida); se a notificação for negada, o painel mostra o som/visual sem erro e oferece um botão para ativar; o título da aba mostra "(n)" pendentes.
**CA-43 (US-40, Must)** Dado um projeto que fica ativo (sessão/agente rodando com `cwd` na pasta DEV), quando o evento chega, então uma das 4 salas de projeto é atribuída a ele (placa com o nome da pasta, quadro, barra de progresso no batente) e "acende"; quando o projeto fica parado por *10 min* a sala escurece; com 5 ou mais projetos ativos, os excedentes entram em lista "+N projetos" na gaveta, sem erro, e ganham sala quando uma vaga liberar (política em PA-11).
**CA-44 (US-11, Must)** Dado uma sessão cujo `cwd` está **fora** da pasta DEV, quando eventos chegam, então os NPCs aparecem trabalhando normalmente, mas sem criar sala de projeto, com rótulo "Fora de 7 - DEV" (só o nome da pasta, não o caminho completo); essa pasta nunca aparece no seletor de projetos do chat e o servidor não lê PLANO.md dela (padrão sugerido, PA-06).
**CA-45 (Must)** Dado o ciclo de vida das sessões PTY, quando fecho o painel, encerro o servidor ou uma sessão termina, então processos `claude` abertos pelo painel não ficam órfãos (são encerrados ou explicitamente preservados e reencontrados na reabertura, conforme PA-09), há limite de sessões simultâneas (*4*), e o painel mostra o estado real (rodando/encerrada/erro).
**CA-46 (Must)** Dado o pentest, quando a Fase 2 é entregue, então os relatórios do revisor de segurança (Sérgio) e do pentester (Pedro) não têm achados CRÍTICO/ALTO abertos, e foram testados no mínimo: acesso sem token, token errado, CSRF por página de outro Origin, DNS rebinding, path traversal/junction, injeção de argumentos/ comandos por nome de projeto e mensagem, WebSocket sem Origin, XSS via saída do Claude/nome de pasta/PLANO.md, e replay/duplicidade de aprovações.
**CA-47 (US-02, Must)** Dado o conteúdo renderizado vindo de fontes externas (saída do Claude, nomes de pasta, PLANO.md, mensagens de hook), quando exibido, então é sempre tratado como texto não confiável (escapado/sanitizado); um nome de pasta `<img src=x onerror=...>` ou markdown com HTML/script não executa código.

### Fase 3 — Acompanhamento

**CA-48 (US-16, Must)** Dado um `docs/projeto/*/PLANO.md` com tabela de tarefas, quando o arquivo é salvo, então o painel atualiza o kanban e o progresso em p95 ≤ 2 s sem recarregar (M-07); novos PLANO.md em pastas novas são detectados sem reiniciar o servidor.
**CA-49 (US-16, Must)** Dado um PLANO.md ausente, vazio, com tabela malformada ou sem tarefas, quando o painel o lê, então o cartão do projeto mostra "sem plano"/"plano ilegível — linha N" em vez de erro, o progresso exibe "—" (nunca NaN/0% enganoso) e as demais telas continuam funcionando; leituras parciais durante a gravação do arquivo não geram estado inconsistente.
**CA-50 (US-16, Must)** Dado um projeto com T tarefas das quais C estão "Concluída", quando calculo o progresso, então % = round(C / T × 100) e o cartão mostra também fase atual e tamanho (P/M/G) lidos do cabeçalho do PLANO.md; com T = 0 mostra "—" (mapeamento de tarefas canceladas/duplicadas em PA-04).
**CA-51 (US-17, Must)** Dado as tarefas do projeto, quando abro o kanban, então existem as 5 colunas (A fazer / Em andamento / Em revisão / Concluída / Bloqueada), cada tarefa aparece na coluna do mapeamento de status acordado (PA-03), com o rosto do NPC responsável (do campo "responsável" da tabela); responsável desconhecido mostra o rosto de Freelancer; status desconhecido vai para "A fazer" com um selo "status não reconhecido".
**CA-52 (US-17, Should) [depende de pesquisa P3]** Dado uma lista de tarefas do Claude (TodoWrite/ferramentas de tarefas) e eventos SubagentStart/Stop, quando mudam, então o kanban reflete: tarefas do PLANO.md têm precedência na definição do conjunto; eventos movem para "Em andamento" (início) e sinalizam "em revisão/concluída" conforme PA-03; se os hooks não expuserem tarefas, o kanban funciona só com PLANO.md + Start/Stop e mostra nota "tarefas do Claude indisponíveis".
**CA-53 (US-18, Should)** Dado um PLANO.md com seções "Entregáveis" e "Definition of Done" com itens `- [ ]/- [x]`, quando abro o projeto, então vejo as duas listas com marcações corretas e contagem (ex.: 4/9); a linha do tempo mostra as 6 etapas (planejado → aprovado → construção → qualidade → docs → PR pronto) com a etapa atual destacada conforme PA-12.
**CA-54 (US-19, Should)** Dado uma tarefa em andamento com NPC responsável trabalhando, quando clico na tarefa, então o cartão e o NPC são destacados e a câmera passa a seguir o NPC até eu soltar ("parar de seguir"/Esc); se nenhum NPC estiver trabalhando nela, aparece "ninguém trabalhando nesta tarefa agora" e a câmera não se move.
**CA-55 (US-20, Could)** Dado um projeto cujas tarefas passam todas a "Concluída" (e/ou PLANO.md marca concluído — PA-12), quando isso acontece com o painel aberto, então ocorre uma única vez a animação de confete e palmas dos NPCs na sala do projeto; não repete ao recarregar a página nem ao reiniciar o servidor; com reduced-motion vira um aviso estático.
**CA-56 (US-21, Must)** Dado `used_percentage` de uma janela (5h ou 7d), quando renderizo a barra, então: 0–60% (inclusive) verde; acima de 60% até 85% (inclusive) amarelo; acima de 85% vermelho; acima de 95% vermelho piscando (a piscada respeita reduced-motion, trocando por ícone/borda fixa); o valor numérico é sempre exibido; valores < 0 ou > 100 são limitados a 0–100 com indicação de dado suspeito.
**CA-57 (US-21, Must)** Dado `resets_at` de cada janela, quando exibo a contagem regressiva, então ela mostra tempo restante no formato "Xh Ym" (≤ 5h) ou "Xd Yh" (7d), decrementa a cada minuto, e ao chegar a zero mostra "reiniciando…" e mantém o último valor sinalizado como desatualizado até chegar leitura nova (sem mostrar tempo negativo).
**CA-58 (US-24, Must) [depende de pesquisa P2]** Dado o script de statusLine (Node, sem dependências), quando o Claude Code o executa passando JSON por stdin, então imprime uma linha útil no terminal (ex.: modelo, projeto, uso 5h/7d com reset) em ≤ 200 ms e grava `~/.claude/equipe/uso.json` de forma atômica (arquivo temporário + renomear) com o último valor e o horário da leitura; com stdin vazio, JSON inválido ou sem `rate_limits` (ex.: antes da primeira resposta, plano sem o campo, API key), imprime linha básica sem erro, sai com código 0 e **não** sobrescreve um valor bom anterior com vazio.
**CA-59 (US-24, Must)** Dado um `settings.json` que já possui `statusLine` (ou outras chaves), quando a configuro, então o diff é mostrado antes e só é aplicado com meu OK; a statusLine existente é preservada encadeando sua saída (ou, se não for possível, o script avisa e pergunta); backup datado é feito; nenhuma outra chave é alterada; reversão documentada.
**CA-60 (US-22, Must)** Dado `used_percentage` ≥ 80% numa janela, quando a leitura chega, então aparece alerta (banner + som respeitando mute) uma única vez por limiar e por ciclo da janela; ao passar de 95% aparece o alerta crítico (uma vez); quando a janela reinicia (uso < 80%), os alertas são rearmados; oscilação em torno do limiar (ex.: 79↔80) não repete alertas.
**CA-61 (US-23, Must) [depende de pesquisa P2]** Dado o último valor conhecido, quando `uso.json` não é atualizado há mais de *2 min* (PA-14), então a barra continua mostrando o último valor com o selo "atualizado há X min" (X crescente; "há 1 h 5 min" acima de 60 min; "sem dados" se nunca houve leitura); se o Claude Desktop alimentar a statusLine normalmente, o selo não aparece; vale nos dois cenários.
**CA-62 (US-26, Could) [depende de pesquisa P2]** Dado que o JSON traz `spend_limit` ou janela por modelo, quando presente, então a barra/rótulo adicional é exibido com as mesmas regras de cor; quando ausente, nada é exibido (sem espaço vazio nem erro).
**CA-63 (US-25, Should)** Dado JSONL em `~/.claude/projects/`, quando o painel agrega, então mostra gráfico de barras de tokens por projeto, por agente e por dia (entrada, saída, cache — conforme campos disponíveis) e, para um conjunto de fixtures com totais conhecidos, a soma exibida é exatamente igual à esperada; linhas corrompidas/desconhecidas são ignoradas com contador "N linhas ignoradas"; a leitura é incremental (não relê tudo a cada mudança) e não ultrapassa M-04.
**CA-64 (US-25, Must)** Dado a leitura de JSONL, quando o painel persiste ou expõe dados, então guarda/exibe apenas agregados (contagens, ids, datas, nome de projeto/agente) e **nunca** o texto de prompts, respostas, conteúdo de arquivos ou saídas de ferramentas em cache/logs/APIs de métrica; verificável por teste que inspeciona o cache e as respostas da API.

### Fase 4 — Vida

**CA-65 (US-33, Should)** Dado NPCs parados, quando observo por 30 min simulados, então cada NPC alterna entre mesa, café, copa, banheiro (entra e some, sem cena dentro), janela, terraço e fliperama em intervalos aleatórios (faixa *30 s–5 min*); em nenhum instante mais de *40%* dos NPCs parados estão na mesma atividade/local (teste por simulação com semente); NPC chamado para trabalhar interrompe a rotina imediatamente.
**CA-66 (US-34, Should)** Dado dois NPCs próximos em conversa, quando aparece um balão, então o texto está em pt-BR, tem efeito de máquina de escrever (desligável por reduced-motion: texto aparece inteiro), vem de frases pré-escritas por cargo/personalidade (sem custo de tokens), não repete a mesma frase em sequência e o balão some após *4–8 s*; a biblioteca de falas é editável em arquivo.
**CA-67 (US-34, Should)** Dado eventos reais recentes (ex.: "Teresa achou 2 bugs no projeto Sites", delegação, aprovação do projeto), quando gera-se uma fofoca, então a frase é montada de modelos pré-escritos com dados reais (nomes de NPC, número, nome da pasta) apenas de eventos das últimas *24 h* e a informação é verdadeira (teste com fixtures); sem eventos recentes, só frases pré-escritas; nenhum conteúdo de conversas/código/segredos entra nas frases (§5.3).
**CA-68 (US-35, Could)** Dado a configuração padrão, quando uso o escritório, então falas por IA estão **desligadas**; ao ligar a opção, aparece aviso de custo (qual crédito/limite é usado, conforme P1), confirmação explícita, indicador visível de "IA ligada" e contador de uso da sessão; desligar interrompe as chamadas imediatamente.
**CA-69 (US-32, Must) [depende de pesquisa P3]** Dado o NPC trabalhando e o evento de ferramenta, quando a ferramenta é Edit/Write, então ele digita; Read/Grep/Glob, lê; Bash, usa o mini-terminal brilhando; WebFetch/WebSearch, pesquisa com livro; ferramenta desconhecida ou ausência de eventos de ferramenta, animação genérica "trabalhando"; ao parar, comemora brevemente e volta à rotina; quando o NPC trabalha, vai à sala do projeto/mesa de reunião ou fica na mesa, conforme configuração (padrão em PA-15).
**CA-70 (US-36, Should)** Dado uma sessão ativa do Diretor num projeto, quando há delegação (SubagentStart de um agente), então o Diretor está na sala do projeto, aparece o balão "<Apelido>, preciso de você!" e o NPC chamado caminha até ele; com delegação simultânea a vários, os balões são enfileirados sem sobrepor.
**CA-71 (US-36, Should)** Dado um NPC com aprovação pendente (PermissionRequest/plano), quando o cartão está ativo, então o ícone "!" pula sobre a cabeça do NPC e ele espera na porta da Diretoria; ao decidir/expirar, o NPC volta ao estado anterior (a versão básica do "!" entra na fase 2).
**CA-72 (US-37, Should)** Dado cada NPC, quando seu estado muda, então o ícone sobre ele é: ⚙ trabalhando, ☕ pausa, 💤 parado há mais de *30 min* (PA-16), ! precisa de você; precedência: ! > ⚙ > ☕ > 💤; os ícones têm equivalente textual no cartão de hover.
**CA-73 (US-38, Could)** Dado os mascotes (Lulu da Pomerânia laranja e golden retriever filhote), quando observo, então eles passeiam, seguem NPCs, dormem perto de quem está parado e soltam corações ao clique; nunca bloqueiam caminhos ou cliques em NPCs; com reduced-motion ficam em poses estáticas (clique ainda gera um coração estático).
**CA-74 (US-51, Should)** Dado o horário de Brasília (America/Sao_Paulo, independentemente do fuso do Windows), quando o relógio avança, então a luz das janelas passa por amanhecer, dia, pôr do sol e noite, luminárias e cordão de luzinhas do terraço acendem à noite, e NPCs bocejam com frequência maior na madrugada/noite tardia; é possível simular a hora (parâmetro de teste/debug) para verificar cada faixa; os limites de cada faixa horária ficam no guia visual.
**CA-75 (US-52, Could)** Dado a data, quando é dezembro, então Natal (árvore, luzes, gorros); junho, festa junina; fevereiro, Carnaval; e quando um projeto faz aniversário (1 ano desde o primeiro commit/criação da pasta — PA-17) aparece marco comemorativo no dia; fora dessas datas nenhuma decoração sazonal; simulação de data disponível para teste; desativável em configurações.
**CA-76 (US-53, Could)** Dado o escritório, quando ocorre chuva (aleatória, *1–3 vezes ao dia, 2–10 min*), então aparece nas janelas sem aumentar o custo além de M-01/M-02 e é desligada com reduced-motion ou pela configuração.
**CA-77 (US-54, Could)** Dado a configuração padrão, quando abro o escritório, então música e efeitos estão **desligados/mudos**, nada toca sem ação do Carlos (exceto o "plim" de aprovação se o som estiver ativado); botão de som na barra superior; música lo-fi tem play/pause e volume; as faixas têm licença livre registrada em CREDITS (CA-05); volumes e escolhas persistem.
**CA-78 (US-49, Could)** Dado o Modo TV, quando ativo (botão/atalho), então a tela cheia mostra o escritório sem as gavetas, com um resumo discreto (limite 5h/7d e contador de aprovações) legível a distância; Esc sai; o token de acesso e dados sensíveis não são exibidos.
**CA-79 (US-50, Could)** Dado uma viewport de 390×844 (emulação), quando abro o painel (acesso local), então o escritório reduzido aparece no topo e as abas em lista embaixo, sem rolagem horizontal, alvos de toque ≥ 44 px; e continua não existindo acesso fora do 127.0.0.1 (CA-01).
**CA-80 (US-44/45/46/47, Must/Should)** Dado a HUD, quando uso o painel, então existem: barra superior (nome do estúdio, relógio, barras 5h/7d com reset, "agentes trabalhando X/16", "projetos ativos", botão de som); gaveta esquerda Projetos (clicar centraliza a câmera na sala); gaveta direita com abas Chat / Precisa de você (contador vermelho) / Atividade (feed em tempo real com rosto do NPC, ≥ 200 itens mantidos, mais novos no topo); painel inferior recolhível com kanban do projeto selecionado; minimapa, zoom por scroll em números inteiros (2×, 3×, 4×, sem desfoque) e botão "seguir NPC". As partes entregues em cada fase estão no mapa de rastreabilidade.
**CA-81 (Must)** Dado a carga máxima (16 NPCs + Freelancers + 2 mascotes + 4 salas acesas + chuva + modo noite), quando meço por 10 min, então M-01 e M-02 continuam atendidos; se não forem, a qualidade gráfica reduz automaticamente (efeitos opcionais primeiro) em vez de exceder o limite.
**CA-82 (Must)** Dado cada asset (sprite, tileset, fonte, som, música), quando entra no repositório, então há registro em CREDITS com autor, licença, URL e se exige atribuição; fontes são OFL (ex.: Pixelify Sans, Silkscreen) e distribuídas localmente (sem CDN externo em runtime); nenhum asset contém logo/personagem de marca registrada; cada agente tem aparência única coerente com o cargo (lista no pedido §7 como exemplos: chefe de blazer, Pedro com capuz, Rafael com colete, Eduardo com óculos de proteção, Bianca com caneta no cabelo).

### Fase 5 — Troca

**CA-83 (US-55, Must)** Dado o `abrir-escritorio.bat` atualizado, quando o servidor do novo escritório está desligado, então ele o inicia, aguarda ficar saudável (timeout *20 s* com mensagem de erro clara) e abre a página no navegador padrão; quando já está ligado, apenas abre a página (sem segundo servidor); ao executar duas vezes seguidas não há dois processos.
**CA-84 (US-55, Must)** Dado a inicialização do Windows e o atalho "Escritório dos Agentes", quando reinicio o PC e faço login, então o novo escritório sobe/abre com a mesma lógica de hoje, e o atalho aponta para o novo; o token é fornecido ao navegador sem que eu precise digitá-lo (forma em PA-02), sem expô-lo em linha de comando visível em listagens de processo.
**CA-85 (US-56, Should)** Dado a troca concluída, quando quero voltar atrás, então existe backup datado do `.bat`, do atalho e da entrada de inicialização anteriores, e um passo-a-passo (ou script) de rollback testado; o Pixel Agents antigo deixa de iniciar automaticamente, mas não é desinstalado/apagado.
**CA-86 (Must)** Dado a troca, quando o novo escritório é a opção principal, então a porta final está definida (PA-18), não há conflito com o antigo, e os hooks do antigo e do novo não disparam em duplicidade (ou o antigo é desativado com meu OK e diff).
**CA-87 (US-57, Must)** Dado o repositório final, quando leio a documentação, então ela existe em pt-BR e en (instalação, uso, como personalizar salas/NPCs/falas/mascotes, como contratar e aparecer no escritório, configuração de modo de sessão/custos, solução de problemas, segurança) e uma pessoa seguindo apenas o "Guia de instalação" no Windows 11 limpo chega ao escritório rodando.
**CA-88 (Must)** Dado cada fase concluída, quando fecho a entrega, então: repositório novo; commits feitos só pela Gabriela no padrão da equipe, atômicos; CHANGELOG atualizado; PR pronto por fase; **nenhum push** sem meu OK; Definition of Done do plano cumprido; e peço meu OK ao final da fase antes de iniciar a próxima.
**CA-89 (Must)** Dado a entrega final, quando rodo build, lint, typecheck e a suíte de testes no Windows 11, então todos passam sem erros, e a matriz CA → teste (Teresa) não tem CA "Must" sem cobertura.

---

## 5. Requisitos não funcionais

### 5.1 Desempenho
- Metas M-01 a M-07. Renderização limitada a 30 fps, pausa em aba oculta, CPU baixa com aba aberta o dia todo; degradação graciosa (CA-81).
- Arquivos observados (PLANO.md, escritorio.json, uso.json, JSONL) com debounce e leitura incremental; erros de leitura nunca derrubam o servidor.
- Memória do servidor e do navegador estável em 8 h (sem vazamento perceptível; M-04).
- Sem gasto de tokens por padrão (M-08).

### 5.2 Segurança (modelo de ameaças inicial, em tópicos — a ser aprofundado pelo Sérgio/Pedro)
Ativos: sessões do Claude Code (capacidade de executar código no PC do Carlos), decisões de permissão, token de acesso, `settings.json`, conteúdo dos projetos e das conversas.
- **T1 Acesso de outra máquina da rede** → bind só em 127.0.0.1 (CA-01); Windows Firewall não é suficiente como única barreira.
- **T2 Página maliciosa aberta no navegador do Carlos (CSRF / DNS rebinding / WebSocket cross-site)** → token + verificação de Origin e Host em HTTP e WebSocket (CA-30); cookies SameSite quando houver.
- **T3 Outro usuário/processo local lendo o token** → token em arquivo com permissão restrita ao usuário (ACL do Windows), nunca em argumento de linha de comando, nunca em logs/URL persistida; rotação possível.
- **T4 Path traversal / junction / UNC para sair de "7 - DEV"** → caminho canônico real e allowlist (CA-29).
- **T5 Injeção de comando/argumento via nome de projeto, mensagem ou sessão** → montagem de comando só no servidor, sem shell, validação por lista fechada (CA-28, CA-31).
- **T6 XSS via conteúdo (saída do Claude, PLANO.md, nomes)** → escapar/sanitizar tudo + CSP restritiva (CA-47).
- **T7 Aprovação indevida/forjada de permissão** → id não adivinhável, uma resposta por cartão, expiração, vínculo com a sessão, decisão padrão em falha = não decidir (CA-38–40); nunca "aprovar tudo" automático.
- **T8 Negação de serviço local / sessões PTY em excesso** → limites de sessões, tamanho de mensagem, taxa de requisições (CA-45).
- **T9 Alteração indevida do `settings.json`/hooks** → diff + OK + backup (CA-20, CA-59).
- **T10 Dependências vulneráveis/cadeia de suprimentos (node-pty, xterm.js, bibliotecas gráficas)** → SCA (Sérgio), versões fixadas, sem instalação global.
- **T11 Vazamento de dados sensíveis na tela/logs (Modo TV, gravação de tela)** → mascaramento de segredos; Modo TV sem token (CA-78).
- **T12 Terminal web com entrada** → somente leitura por padrão; entrada exige habilitar, token e Origin (CA-33).

### 5.3 Privacidade e dados (leitura de JSONL de conversas)
Os JSONL em `~/.claude/projects/` contêm prompts, respostas, trechos de código e possivelmente segredos. Regras:
- **NÃO persistir** (cache, banco, logs, arquivos do escritório): texto de prompts/respostas, conteúdo de arquivos, saídas de ferramentas, entradas de ferramentas (comandos completos), variáveis de ambiente. Persistir apenas agregados: contagem de tokens, ids, timestamps, nome de agente, nome de pasta do projeto.
- **NÃO expor** pela API/UI/frases dos NPCs/Modo TV: o conteúdo acima, exceto o necessário para decisão do próprio Carlos no cartão de aprovação "Ver detalhes" e no chat (exibição transitória, dado ao Carlos apenas, com segredos mascarados por padrões conhecidos: chaves de API, tokens, senhas, `.env`).
- **Histórico de chat do painel:** a política de retenção é a do Claude Code (os JSONL são a fonte; o escritório guarda apenas ids de sessão/metadados) — ver PA-09.
- Logs do servidor: sem corpo de mensagens, sem token, sem caminhos fora do necessário; nível de log configurável.
- Dados ficam só na máquina; nenhuma telemetria, nenhum serviço externo em runtime (fontes e assets locais).
- LGPD: uso pessoal local, sem dados de terceiros tratados pelo produto; ainda assim, mínimo necessário e sem transmissão (Lei 13.709/2018, princípios de finalidade/necessidade). Dados de clientes que apareçam nas conversas não saem do computador.
- Frases de NPC e feed de Atividade usam só metadados (quem, qual projeto, contagens, status).

### 5.4 Acessibilidade
- `prefers-reduced-motion` (CA-22), contraste WCAG 2.2 AA (CA-24), navegação por teclado completa e atalhos (CA-23), foco visível, rótulos ARIA/`aria-live` para alertas e novas aprovações, o canvas tem alternativa textual (lista de agentes/estado na Atividade e no cartão), cor nunca é o único indicador, tamanho de fonte ajustável (zoom do navegador até 200% sem perda de função da HUD), pisca ≤ 3 Hz (limiar de crise/ 95% respeita CA-56). Alvos de toque ≥ 44 px no layout celular.

### 5.5 Internacionalização
- pt-BR padrão e en; textos de interface, falas dos NPCs (pré-escritas em pt-BR; versão en opcional, **Could**), mensagens de erro, datas/horas/números formatados por idioma; horário do ambiente fixo em Brasília; documentação bilíngue; sem texto fixo no código (CA-10).

### 5.6 Licenças e créditos
- Pixel Agents: MIT — manter `LICENSE` e aviso de copyright, creditar o projeto de origem (CA-05).
- Fontes OFL (Pixelify Sans, Silkscreen) com texto da licença incluído; sem CDN.
- Pacotes de arte: licença que permita uso e modificação; atribuição quando exigida; compra só após OK (CA-26); verificar se a licença permite **redistribuição no repositório** (se o repositório for público, assets pagos geralmente não podem ser commitados — PA-03b/PA-19).
- Música lo-fi: apenas faixas livres de direitos (CC0/CC-BY com atribuição); sem material de marcas.
- Verificação das licenças das dependências (npm) pelo Sérgio (SCA) — nenhuma licença incompatível com o repositório.
- Nenhum logo/personagem de marca registrada (CA-82).

### 5.7 Compatibilidade
- Windows 11 (PowerShell/cmd; ConPTY para o PTY); Node na versão LTS vigente indicada pelo arquiteto; navegadores modernos (Chrome/Edge atuais; Firefox como Should); caminhos com espaços e acentos ("7 - DEV", "Documentos") funcionando; OneDrive: a pasta do projeto fica dentro do OneDrive, então o escritório não pode travar por arquivos sincronizando/bloqueados; resolução de 1366×768 até 4K; 100%–200% de escala do Windows.
- Offline: funciona sem internet (exceto o Claude em si); sem dependência de CDN.
- Hardware: sem exigência de GPU dedicada; PC modesto com aba aberta o dia todo (M-02).
- Sem instalação global de nada (restrição); dependências locais ao projeto.

### 5.8 Manutenção e qualidade
- Testes automatizados da lógica (CA-25, CA-89), CA→teste rastreável; lint/typecheck/build limpos.
- Configuração por arquivos documentados (`escritorio.json`, frases, mascotes, mapa), sem recompilar quando possível.
- ADRs para decisões significativas (Canvas 2D × PixiJS × Phaser; PTY; protocolo de hooks; formato de uso.json).
- Resiliência a mudanças do Claude Code: parsers tolerantes a campos novos/ausentes (hooks, statusLine, JSONL); formato de eventos versionado; testes com fixtures reais anonimizadas.
- Logs com níveis, sem dados sensíveis; mensagens de erro acionáveis.
- Documentação bilíngue em dia (CA-87).

---

## 6. Dependências externas e riscos de produto

### 6.1 Dependências
| ID | Dependência | Impacto | Pesquisa |
|---|---|---|---|
| D-01 | Pixel Agents (MIT): código, hooks, formato de eventos | Base da fase 1 | P4 |
| D-02 | Hooks do Claude Code (SubagentStart/Stop, PermissionRequest, eventos de tarefas/ferramentas) e seus formatos/timeouts | NPCs, aprovações, kanban | P3 |
| D-03 | statusLine e campo `rate_limits`/`used_percentage`/`resets_at` (Pro/Max, depois da 1ª resposta); alimentação ou não pelo Desktop | Medidor | P2 |
| D-04 | Formato dos JSONL em `~/.claude/projects/` (não é API estável) | Tokens, histórico, fallback do Desktop | P3 |
| D-05 | CLI `claude` (`--resume`, `-p --output-format stream-json`, agente chefe) | Chat | P1 |
| D-06 | node-pty / ConPTY (compilação nativa no Windows), xterm.js | Chat e Terminal | Artur |
| D-07 | Pacotes de arte, fontes e música com licença compatível | Fase 1 e 4 | Bianca/Paula |
| D-08 | Skill `rh-equipe` e `QUADRO.md` (fonte da equipe) | CA-21 | — |
| D-09 | Formato do PLANO.md (modelo da skill `plano-projeto`) como contrato de leitura | Fase 3 | Artur |

### 6.2 Riscos de produto
| ID | Risco | Prob./Impacto | Mitigação / requisito |
|---|---|---|---|
| R-01 | **Custo:** `claude -p`/Agent SDK consome crédito separado; uso acidental gera gasto inesperado | Média/Alto | Modo padrão interativo; Automático opt-in com aviso (CA-34); gate P1 (CA-35); IA nas falas desligada (CA-68) |
| R-02 | **Termos de Uso (ToS):** automatizar/encapsular o Claude Code por PTY, ou reutilizar credenciais de assinatura em ferramenta de terceiros, pode ferir os termos | Média/Alto | P1 deve confirmar o que é permitido (uso pessoal local da CLI oficial, sem extrair/compartilhar credenciais); o produto nunca lê/copia credenciais de login; resultado apresentado ao Carlos antes da fase 2 |
| R-03 | Statusline não alimentada pelo Desktop; `rate_limits` ausente em alguns planos/ANTES da 1ª resposta | Alta/Médio | "atualizado há X min", "sem dados" (CA-58, CA-61); fallback explícito |
| R-04 | Hooks não cobrem sessões do Desktop ou formato muda entre versões | Média/Alto | Parsers tolerantes; fallback JSONL; aviso visível (CA-18); fixtures |
| R-05 | Formato dos JSONL muda | Média/Médio | Leitura tolerante, "N linhas ignoradas" (CA-63) |
| R-06 | node-pty falha em compilar/ConPTY instável no Windows | Média/Alto | Prova de conceito cedo na fase 2 (Artur); alternativa a decidir em ADR |
| R-07 | Superfície de ataque: um painel que injeta texto em sessões do Claude equivale a execução de código por quem acessar | Baixa/Crítico | Seção 5.2, CA-01/03/29/30/31/46; pentest |
| R-08 | Performance: pixel art animada + iluminação + 16 NPCs | Média/Médio | Metas M-01–M-04; degradação (CA-81); ADR de renderização |
| R-09 | Licença de arte paga/restritiva impede repositório público | Média/Médio | Registrar no CREDITS; assets pagos fora do Git se necessário (PA-19) |
| R-10 | Dessincronização QUADRO.md × `escritorio.json` | Média/Baixo | CA-21 com teste de consistência |
| R-11 | Escopo enorme (visual + tempo real + segurança) | Alta/Alto | Fases com OK do Carlos; MoSCoW; itens Could (fase 4) cortáveis sem afetar o núcleo |
| R-12 | Hook PermissionRequest bloqueante pode travar sessões se o painel ficar fora/lento | Média/Alto | Timeout curto, falha rápida (CA-38/39) |
| R-13 | OneDrive sincronizando a pasta do projeto causa travas/arquivos bloqueados | Baixa/Médio | Tolerância a erros de I/O; `node_modules`/builds fora da sincronização se possível (Artur) |
| R-14 | Vazamento de conteúdo sensível na tela (Modo TV, capturas) | Baixa/Médio | §5.3, CA-37, CA-78 |

---

## 7. Perguntas em aberto (priorizadas)

Prioridade: **P0** bloqueia o início da fase indicada; **P1** precisa de resposta antes do item correspondente; **P2** pode seguir com o padrão e ajustar depois. Cada uma traz a **resposta padrão** que usarei/recomendarei se o Carlos não responder.

| # | Pri. | Pergunta | Fase | Sugestão de resposta padrão |
|---|---|---|---|---|
| PA-01 | P0 | Aprova a lista de nomes completos e cargos dos 16 NPCs (a ser proposta pelo Artur em `escritorio.json`)? | 1 | Aprovar com ajustes; apelidos mantidos; chefe = "Diretor de Projetos" |
| PA-02 | P0 | Como o navegador recebe o token no dia a dia (abrir por `.bat` com URL contendo token que vira cookie `HttpOnly`/`SameSite=Strict` e é removido da URL)? | 1 | Sim: `.bat` abre `http://127.0.0.1:3200/?t=...` uma vez, o servidor troca por cookie e redireciona sem o token; token em arquivo só do usuário, rotacionável |
| PA-03 | P0 | Mapeamento do status das tarefas do PLANO.md → colunas do kanban? (a tabela de tarefas do modelo traz status; confirmar os valores exatos) | 3 | `A fazer`/`Pendente`→A fazer; `Em andamento`/`Fazendo`→Em andamento; `Em revisão`/`Revisão`→Em revisão; `Concluída`/`Feita`/`[x]`→Concluída; `Bloqueada`→Bloqueada; desconhecido→A fazer com selo. Artur/chefe confirmam contra `modelo-plano.md` |
| PA-04 | P1 | Tarefas "canceladas/removidas" entram no cálculo do %? | 3 | Não entram (excluídas do total) |
| PA-05 | P0 | Caminho exato da pasta "7 - DEV" e se subpastas de segundo nível (ex.: `7 - DEV/cliente/projeto`) contam como projeto? | 2 | Caminho = pasta-pai deste repositório (`C:\Users\carlo\OneDrive\Documentos\7 - DEV`); só primeiro nível; configurável |
| PA-06 | P1 | O que fazer com sessões de pastas fora de "7 - DEV"? | 2 | Mostrar NPCs trabalhando com rótulo "Fora de 7 - DEV", sem sala de projeto, sem chat/PLANO.md (CA-44) |
| PA-07 | P2 | Kanban é só leitura (sem arrastar para alterar o PLANO.md)? | 3 | Só leitura (F-11) |
| PA-08 | P1 | Tempo limite do hook de permissão antes do fallback? | 2 | 60 s (configurável); depende de P3 sobre o máximo do hook |
| PA-09 | P1 | Retenção do histórico de chat e das sessões PTY: o escritório guarda cópia ou só referencia os JSONL do Claude? Sessões `claude` sobrevivem ao fechar o servidor? | 2 | Só referencia (ids/metadados); sessões são encerradas ao parar o servidor, com aviso se houver trabalho em andamento |
| PA-10 | P1 | A aba Terminal aceita digitação? | 2 | Somente leitura por padrão; "permitir entrada" por sessão |
| PA-11 | P2 | Com mais de 4 projetos ativos, qual ganha sala? | 2 | Os 4 mais recentemente ativos; o resto em "+N" |
| PA-12 | P1 | O que é "projeto ativo" e como detectar a fase (planejado → aprovado → construção → qualidade → docs → PR pronto)? | 2–3 | **Ativo** = tem sessão/agente com evento nos últimos 10 min **ou** PLANO.md com tarefa "Em andamento". **Fase** = campo "Fase" do cabeçalho do PLANO.md; se ausente, deduzida: sem PLANO=planejamento, sem data de aprovação=planejado, tarefas em andamento de dev=construção, tarefas de QA/segurança=qualidade, documentador=docs, tudo concluído+PR.md=PR pronto. **Concluído** = todas as tarefas concluídas e DoD marcado |
| PA-13 | P2 | As metas numéricas M-01..M-07 (30 fps, 5%/1% CPU, 1 s) estão adequadas ao PC do Carlos? | 1 | Aceitar; calibrar após a 1ª medição |
| PA-14 | P2 | A partir de quantos minutos mostrar "atualizado há X min"? | 3 | 2 min sem atualização (e só se havia sessão ativa; sem sessão ativa, mostra "último valor há X") |
| PA-15 | P2 | Ao trabalhar, o NPC vai à sala do projeto/mesa de reunião ou fica na mesa? | 4 | Padrão: fica na mesa; vai à sala do projeto se o projeto estiver ativo há > 2 min com ≥ 2 agentes; configurável |
| PA-16 | P2 | "Parado há muito tempo" = quanto? | 4 | 30 min |
| PA-17 | P2 | Aniversário de projeto: data da criação da pasta ou do 1º commit? | 4 | Data de criação do PLANO.md/pasta |
| PA-18 | P1 | Após a troca, o novo escritório fica na 3200 ou assume a 3100? | 5 | Fica na 3200 (evita conflito de hooks e links); 3100 é liberada |
| PA-19 | P1 | Qual conjunto de arte? O repositório será público? (afeta se assets pagos podem ser commitados) | 1 | Bianca propõe 1 opção gratuita (CC0/CC-BY) e 1 paga com preço/licença; repositório privado por padrão; nada pago sem OK |
| PA-20 | P0 | Nome do estúdio (para a recepção e a barra superior)? | 1 | "Estúdio do Carlos" provisório, configurável em arquivo; Carlos escolhe depois |
| PA-21 | P2 | Falas dos NPCs também em inglês? | 4 | Só pt-BR no início (o pedido define pt-BR); en = Could |
| PA-22 | P1 | Navegadores-alvo (Chrome/Edge/Firefox)? | 1 | Chrome e Edge (Must); Firefox (Should) |
| PA-23 | P2 | O cartão "Ver detalhes" pode mostrar o comando completo e o diff de arquivos? | 2 | Sim, com mascaramento de segredos, só na tela, sem persistir |
| PA-24 | P1 | Qual modo o Diretor usa para sessões "sem painel" aparecerem (fallback JSONL se hooks não cobrirem o Desktop)? | 1 | Aceitar fallback JSONL com atraso documentado; depende de P3 |
| PA-25 | P2 | Fofocas com dados reais: janela de eventos (24 h) e nomes de projeto podem aparecer no Modo TV? | 4 | 24 h; nomes de pasta aparecem, nada além |

---

## 8. Prioridade (resumo MoSCoW)

- **Must:** E1 inteiro; E2 (US-06, 07, 08, 10, 11); E3 (US-12, 13, 14); E4 (US-16, 17); E5 (US-21, 22, 23, 24); E6 (US-27–31); E7 (US-32); E8 (US-39 salas/NPCs, 40, 42, 43); E9 (US-44, 45, 46); E11 (US-55, 57); segurança, privacidade, desempenho e licenças (RNF).
- **Should:** US-09 (Terminal), 15 (plano), 18, 19, 25, 33, 34, 36, 37, 41, 47, 48, 51, 56 e objetos de detalhe do mapa.
- **Could:** US-20 (comemoração), 26 (spend_limit/modelo), 35 (IA nas falas), 38 (mascotes), 49 (Modo TV), 50 (celular), 52, 53, 54.
- **Won't (nesta entrega):** F-01 a F-17 (acesso remoto, IA por padrão, kanban editável, multiusuário, macOS/Linux etc.).

---

## 9. Mapa de rastreabilidade (épico → fase → CAs)

| Épico | Fase | CAs |
|---|---|---|
| E1 Base/Servidor | 1 | CA-01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 20, 25 |
| E1 (troca e finalização) | 5 | CA-83, 84, 85, 86, 87, 88, 89 |
| E2 Chat e Pedidos | 2 | CA-27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47 |
| E2 (sessões Desktop) | 1–2 | CA-18, CA-44 |
| E3 Aprovações | 2 | CA-37, 38, 39, 40, 41, 42; (ícone "!" completo: CA-71 na fase 4) |
| E4 Tarefas/Kanban | 3 | CA-48, 49, 50, 51, 52, 53, 54, 55 |
| E5 Medidor de limite | 3 | CA-56, 57, 58, 59, 60, 61, 62, 63, 64 |
| E6 Equipe/NPCs | 1 | CA-12, 13, 14, 15, 16, 17, 19, 21; tokens no painel: CA-63 (fase 3) |
| E7 Comportamento | 1 (básico) / 4 | CA-15, 16 (fase 1); CA-65, 66, 67, 68, 69, 70, 71, 72, 73 (fase 4) |
| E8 Mapa e arte | 1 / 2 / 3 | CA-11, 24, 26, 82 (fase 1); CA-43 (fase 2); quadros vivos de dados: CA-48–50 (fase 3) |
| E9 HUD | 1–4 | CA-22, 23, 24 (fase 1); CA-80 (partes por fase); CA-78, 79 (fase 4) |
| E10 Ambiente vivo | 4 | CA-74, 75, 76, 77, 81 |
| E11 Troca final | 5 | CA-83, 84, 85, 86, 87 |
| Transversal | todas | CA-25 (testes), CA-46 (segurança), CA-81, CA-88, CA-89 |

**Gates com o Carlos:** (1) aprovação do PLANO.md antes de construir; (2) lista de nomes dos NPCs (CA-12); (3) conclusão da pesquisa de cobrança antes da fase 2 (CA-35); (4) preço e licença antes de qualquer compra (CA-26); (5) diff antes de mexer no `settings.json` (CA-20, CA-59); (6) OK ao final de cada fase e antes de qualquer push (CA-88); (7) pentest antes de entregar a fase 2 (CA-46).

**Itens dependentes de pesquisa:** CA-18 (P3), CA-32/34/35/68 (P1), CA-37/41/52/69 (P3), CA-58/61/62 (P2). Todos escritos com comportamento definido para os dois cenários.
