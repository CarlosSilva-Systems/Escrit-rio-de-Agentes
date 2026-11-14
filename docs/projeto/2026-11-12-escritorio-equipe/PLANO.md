# PLANO — Escritório da Equipe

- **Tamanho:** G · **Criado:** 2026-11-12 · **Aprovado pelo Carlos (G0):** 2026-11-13 ("perfeito, pode terminar a entrega") · **Fase atual:** 0/1
- **Fonte da verdade:** [PEDIDO.md](PEDIDO.md) · Requisitos/CAs: [REQUISITOS.md](REQUISITOS.md) · Pesquisa: [PESQUISA.md](PESQUISA.md)
- **Arquitetura:** [../../ARQUITETURA.md](../../ARQUITETURA.md) · ADRs 0001–0008 em `docs/adr/` · **Tarefas (T-xx, S-xx) e gates:** [TAREFAS.md](TAREFAS.md) · Design: `docs/design/`

## Objetivo
Painel web local em pixel art (127.0.0.1:3200, token) onde a equipe de 16 agentes vive, o Carlos faz pedidos ao Diretor, acompanha tarefas em tempo real e mede o limite do Claude Code. Custo zero de tokens por padrão.

## Escopo
**Dentro:** fases 1–5 do PEDIDO (Fundação, Comando, Acompanhamento, Vida, Troca). **Fora:** acesso remoto/celular fora da rede local, falas por IA (T-90 cancelada por padrão), mexer no Pixel Agents instalado antes da fase 5.

## Decisões técnicas (resumo)
Cópia seletiva do Pixel Agents (MIT) em repositório novo, sem reutilizar a arte dele (ADR-0001) · Canvas 2D próprio (ADR-0002, a confirmar nas medições) · chat por sessão interativa ConPTY com `-p` opcional (ADR-0003) · hooks em níveis, Nível 0 sem tocar no settings.json (ADR-0004) · segurança local com ticket/cookie/CSRF (ADR-0005).

## Decisões padrão adotadas pelo chefe até o Carlos responder (reversíveis)
| Tema | Padrão adotado |
|---|---|
| Arte | Combinação A (gratuita/CC0) + placeholders; nada comprado |
| Nome do estúdio | "Estúdio do Carlos" (configurável) |
| Nomes dos 16 | Proposta do Artur só **dentro do repositório**; `~/.claude/equipe/escritorio.json` NÃO é criado antes do G1 |
| Mapa | 64×52 (Bianca) |
| Música | desligada/ausente por padrão |
| Repositório | privado/local, licença MIT |
| Tailwind | não usar |

## Gates do Carlos (ver TAREFAS.md)
G0 ✅ · G1 nomes (pendente) · G2 instalar Claude Code CLI (pendente; bloqueia S-01, S-03 e testes reais das fases 2–3) · G3 assets pagos (não usado) · G4 diff do settings.json (pendente) · G5 cobrança · G6 statusLine Nível 2 · G7 OK de cada fase + push · G8 troca final.

## Entregáveis
Código · testes automatizados · revisão de código · revisão de segurança + pentest (fases 2+) · docs bilíngues · ADRs · commits/CHANGELOG/PR por fase (push só com OK) · relatório final.

## Definition of Done (padrão M/G + do CLAUDE.md)
- [ ] CAs da fase atendidos com testes passando (`npm run check` verde)
- [ ] Revisão de código sem BLOQUEANTE · segurança sem CRÍTICO/ALTO
- [ ] Docs en + pt-BR · ADRs · CREDITS/NOTICE
- [ ] Commits atômicos (Gabriela), CHANGELOG, PR pronto
- [ ] Sem segredo/temporário/código morto · relatório entregue

## Progresso (atualizado pelo chefe)
- [x] Pesquisa · Requisitos · Design · Arquitetura/ADRs/Tarefas · Aprovação G0
- [ ] Fase 0 (T-01..T-05, S-02, S-05; S-01/S-03 aguardam G2)
- [ ] Fase 1 · [ ] Fase 2 · [ ] Fase 3 · [ ] Fase 4 · [ ] Fase 5

## Histórico de mudanças
- 2026-11-13: G0 aprovado. Defaults adotados para arte/nomes/estúdio. S-02 reduzido a medir o Canvas 2D (Pixi só se estourar o orçamento).
