# CLAUDE.md — Escritório da Equipe

Painel web local (pixel art) com o escritório da equipe de agentes, chat com o Diretor, aprovações, kanban e medidor de limite do Claude Code. Usuário único (Carlos), Windows 11, só `127.0.0.1`.
Plano: `docs/projeto/2026-11-12-escritorio-equipe/` (PEDIDO = fonte da verdade, REQUISITOS = CAs, TAREFAS). Arquitetura: `docs/ARQUITETURA.md`. Decisões: `docs/adr/`.

## Stack (ADR-0007)
Node 26 LTS · TypeScript 6.0.3 · Fastify 5 + @fastify/websocket · React 19 + Vite 8 · motor Canvas 2D próprio (ADR-0002) · zod 4 · node-pty (pacote definido no spike S-01) · xterm.js 6 · Vitest 5 · Playwright 1.65 (Edge instalado) · ESLint 10 + Prettier 3. Versões **exatas** no `package.json`; dependência nova só com justificativa no PR (e ADR se for estrutural).

## Comandos
```
npm ci                 # instalar (nunca -g)
npm run dev            # build web em watch + servidor em watch na 3200
npm run build          # dist/web + dist/server + dist/cli
npm run open           # liga o servidor se preciso e abre o navegador logado (ticket)
npm run check          # lint + typecheck + test:unit + test:int  (obrigatório antes de entregar)
npm run test:e2e       # Playwright (Edge)
npm run schemas:gen    # zod → schemas/*.json
npm run settings:diff  # só mostra o diff proposto do ~/.claude/settings.json
npm run team:check     # QUADRO.md × escritorio.json × mapa.json
```

## Estrutura
- `src/shared/` — TS puro, sem I/O (contratos zod, parser do PLANO.md, máquina de estados dos NPCs, A*, câmera, uso, texto).
- `src/server/` — Fastify, auth, ingest de hooks, watchers, sessões PTY, aprovações, instalador do settings.
- `src/web/` — SPA: `engine/` (Canvas), `hud/` (React), `i18n/`, `store/`, `net/`.
- `src/hook-runtime/` — scripts `.cjs` **sem dependências e sem build** (hook e statusLine), copiados para `~/.escritorio-equipe/bin/`.
- `src/cli/` — `escritorio start|open|stop|status|token:rotate|settings:*|team:*`.
- `assets/` (mapa.json, sprites, fontes OFL, sons), `schemas/`, `tests/{fixtures,integration,e2e}`, `scripts/`, `docs/`.

## Convenções
- Código, identificadores e comentários em **inglês**; textos de interface só via i18n (`src/web/i18n/pt-BR.json` é a fonte; `en.json` com as mesmas chaves). Padrão pt-BR.
- Arquivos: `camelCase.ts` para módulos, `PascalCase.tsx` para componentes React; testes ao lado do código (`*.test.ts`), citando o CA no nome: `it('CA-16: …')`.
- Lógica testável vai para `src/shared/` (funções puras, relógio e RNG injetados).
- Parsers de dados externos (hooks, JSONL, statusLine, PLANO.md) são **tolerantes**: nunca lançam; geram diagnósticos.
- Escrita de arquivo sempre atômica (temp + rename, com retry no Windows).
- Rotas de ação: schema zod **estrito**; leitura de eventos: schema tolerante.
- Código copiado/adaptado do Pixel Agents: cabeçalho de atribuição MIT + entrada no `NOTICE.md` (ADR-0001).
- Arte paga sem direito de redistribuição fica em `assets-private/` (gitignored); o código precisa funcionar com placeholders quando ela não existir.
- Todo asset novo: entrada no `CREDITS.md`/`CREDITS.pt-BR.md` (autor, licença, URL); `npm run credits:check`.
- Autoria: todo commit sai como autor **CarlosSilva-Systems** (https://github.com/CarlosSilva-Systems), com `user.email` = `CarlosSilva-Systems@users.noreply.github.com` configurado em `git config --local`. Nunca usar outro autor nem expor e-mail pessoal. **Proibido** em commits, tags, PRs e issues: trailer `Co-Authored-By`, "Generated with Claude Code" ou qualquer menção a Claude/IA (decisão do Carlos, 2026-11-13). Remoto: https://github.com/CarlosSilva-Systems/Escrit-rio-de-Agentes (push só com OK do Carlos).
- Commits: **Conventional Commits** (`feat(server): …`, `fix(web): …`, `docs: …`, `test: …`, `chore: …`), feitos **só pela git-github (Gabriela)**. Branch por fase: `feat/fase-N-<nome>`. Push só com OK do Carlos.
- Documentação: bilíngue (`docs/en` + `docs/pt-BR`, README + README.pt-BR, CHANGELOG + CHANGELOG.pt-BR), Diátaxis; ADRs em inglês com resumo pt-BR.

## Segurança — regras inegociáveis (ADR-0005)
- Servidor **só** em `127.0.0.1` (não existe opção de host). Porta 3200; ocupada → erro, nunca outra porta.
- Toda rota exige sessão; ações exigem `Origin` exato + `X-Escritorio-CSRF`; WebSocket valida Host/Origin/cookie. Sem CORS.
- Token longo nunca no navegador, na URL, em argv, em variável de ambiente de filhos, nem em log. Tokens em `~/.escritorio-equipe/` com ACL do usuário.
- O navegador **nunca** envia caminho, comando, argumento de CLI ou variável de ambiente: só texto de mensagem, nome de projeto validado, ids, decisões e configurações de lista fechada. `spawn`/`execFile` sempre com `shell:false` e argv montado no servidor.
- Pastas de projeto: só 1º nível de "7 - DEV", resolvidas por `realpath.native`; junction/symlink/UNC/8.3/nomes reservados → rejeitar.
- Conteúdo externo (saída do Claude, PLANO.md, nomes de pasta) é texto não confiável: escapar; markdown só via marked (sem HTML) + DOMPurify. CSP restritiva.
- Aprovações: em qualquer erro o hook **não decide** (fluxo normal do Claude). Nunca "aprovar" por padrão.
- Privacidade: nunca persistir/logar prompts, respostas, `tool_input`, saídas de ferramentas ou conteúdo de arquivos; só agregados e ids. Nunca ler `~/.claude/.credentials.json` nem tokens OAuth.
- Nenhuma chamada a `claude -p`, Agent SDK ou API paga sem ação explícita do Carlos (custo zero por padrão). Testes usam `tests/fixtures/fake-claude.mjs`; testes `@real` só com OK.

## Nunca fazer
- Tocar no Pixel Agents instalado (`%APPDATA%\npm\node_modules\pixel-agents`), em `~/.pixel-agents/` ou em `C:\Users\carlo\pixel-agents\*.bat` **antes da fase 5** (CA-04; hashes em `baseline-hashes.json`).
- Alterar `~/.claude/settings.json` sem mostrar o diff (`npm run settings:diff`) e ter o OK do Carlos; sempre com backup e mescla aditiva.
- Criar/alterar `~/.claude/equipe/escritorio.json` antes da aprovação da lista de nomes (gate G1).
- Instalar algo global, usar CDN em runtime, comprar asset ou reutilizar arte/fonte do Pixel Agents.
- Commitar, fazer push, merge ou tag (exclusivo da git-github).
- Deixar segredo, `.env`, arquivo temporário, `spikes/` ou código morto no diff do `main`.

## Definition of Done (por tarefa)
CAs da tarefa com teste passando · `npm run check` verde · i18n completo (pt-BR + en) · sem texto fixo · logs sem dado sensível · docs/CREDITS/NOTICE atualizados quando aplicável · relatório de entrega com o comando rodado e o resultado real.
