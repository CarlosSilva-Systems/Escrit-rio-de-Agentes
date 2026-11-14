# Referência: rotas REST e WebSocket

[🇺🇸 English](../../en/reference/api.md) · [Índice da documentação](../README.md)

Esta é a interface entre o servidor (`127.0.0.1:<porta>`), o navegador, a CLI e o hook. Lista o que existe na Fase 1. Os formatos exatos estão nos contratos zod (`src/shared/contracts/`) e nos schemas gerados `schemas/rest.v1.schema.json` e `schemas/events.v1.schema.json`. Segredos nunca aparecem aqui.

## Modos de acesso

| Modo | Credencial | Usado por |
|---|---|---|
| `public` | nenhuma | callback do ticket, prova de identidade |
| `bearer` | `Authorization: Bearer <token mestre>`, sem cabeçalho `Origin` | CLI |
| `session` | cookie `esc_sid` (`HttpOnly`, `SameSite=Strict`) | navegador |
| `hook` | `Authorization: Bearer <token de hook>`, sem cabeçalho `Origin` | script do hook |

Toda requisição precisa trazer o `Host` exato (`127.0.0.1:<porta>` ou `localhost:<porta>`). Não há CORS. Requisições que alteram algo (POST, PUT, PATCH, DELETE) vindas do navegador também exigem o `Origin` exato e o cabeçalho `X-Escritorio-CSRF` com o valor de `GET /api/session`. Respostas de API e de autenticação saem com `Cache-Control: no-store`. Os erros têm o formato `{"error":{"code":"…","message":"…"}}` no idioma configurado: `401` não autorizado, `403` recusado, `404`, `413` corpo grande demais, `429` limite de requisições, `500`.

## Rotas HTTP

| Método e rota | Acesso | Para quê |
|---|---|---|
| `GET /auth/callback?ticket=<t>` | public | Troca um ticket de uso único pelo cookie de sessão e responde `303` para `/`. Ticket inválido ou já usado: página `401`. |
| `POST /api/auth/ticket` | bearer | Emite um ticket: `{ticket, expiresInSec: 60}`. |
| `GET /api/health` | bearer ou session | `{ok: true, version}`. |
| `GET /api/health/proof?n=<nonce>&k=master\|hook` | public | `{proof}`: HMAC-SHA256 do nonce com a chave do token, para o cliente verificar a identidade do servidor antes de enviar uma credencial. |
| `POST /api/auth/logout` | session + CSRF | Esquece a sessão, expira o cookie, fecha os sockets dela (`204`). Usada por Configurações → Sair. |
| `GET /api/config` | session | As configurações públicas (`lang`, `sound`, `music`, `quality`, `approvalDeadlineSec`, `chatMode`, `npcWorkPlace`). |
| `PATCH /api/config` | session + CSRF | Altera configurações de uma lista fechada. O corpo é um `ConfigPatchSchema` estrito (campos desconhecidos ou corpo vazio: `400`). Gravado de forma atômica no `config.json`; devolve as configurações completas atualizadas. As mensagens do servidor e da CLI passam na hora para o idioma salvo. |
| `GET /api/session` | session | `{csrfToken, lang}`. |
| `POST /api/admin/shutdown` | bearer | Desligamento educado para o `escritorio stop` (`202`). |
| `GET /api/state` | session | `OfficeSnapshot`: equipe, NPCs, aprovações, projetos, atividade (últimas 200), configuração pública, diagnósticos. |
| `GET /api/npcs/:key/history` | session | Últimas atividades de um NPC, da mais nova para a mais antiga (só metadados). `400` para chave malformada, `404` para NPC desconhecido. |
| `GET /api/diag` | session | Só contadores (nunca conteúdo), por exemplo `ingest.accepted`, `ingest.invalid`, `jsonl.events`. |
| `POST /api/hooks/v1/claude` | hook | Recebe o payload de um hook. `204`: aceito, duplicado ou evento ignorado. `202`: corpo inutilizável (contado como `ingest.invalid`). Nunca um 4xx por problema de conteúdo. Corpo de até 1 MB. |
| arquivos estáticos | session | A aplicação web de `dist/web`. |

Previstas para fases futuras e **ainda não implementadas**: rotas de projetos, chat, aprovações, plano, uso e tokens.

### Limites

| Limite | Valor |
|---|---|
| Corpo da requisição | 64 kB (rota de hook: 1 MB) |
| Taxa geral da API | 120 requisições por minuto por sessão (anônimas: por endereço) |
| `/auth/*` e `/api/auth/*` | 10 por minuto |
| Requisições que alteram algo | 30 por minuto por sessão |
| `/api/health` | 600 por minuto |
| `/api/health/proof` e a rota de hook | 6000 por minuto |
| Validade do ticket | 60 s, uso único |
| Sessão do navegador | 8 h de inatividade, no máximo 24 h |

## WebSocket `/ws`

Autenticado pelo cookie de sessão mais `Origin` e `Host` exatos durante o upgrade (senão `403`). O servidor envia um `snapshot` completo ao conectar e depois mensagens agrupadas a cada 100 ms no máximo como `{"t":"batch","items":[…]}`.

Servidor para cliente (`t`): `hello`, `snapshot`, `npc.update`, `npc.remove`, `activity`, `team`, `diag` e, definidas para fases futuras, `approval.upsert`, `approval.remove`, `project.upsert`, `rooms`, `plan.update`, `usage`, `tokens`, `chat.session`, `chat.items`, `alert`.

Cliente para servidor: só `{"t":"ping"}` (schema estrito; outros quadros são ignorados).

| Código de fechamento | Motivo |
|---|---|
| `1008` | Mais de 50 mensagens em um segundo |
| `1013` | Mais de 20 clientes simultâneos |
| `4401` | Sessão encerrada ou invalidada (rotação de token) |

Não existe mensagem WebSocket para configurações: uma mudança feita numa aba só chega às outras abas abertas quando elas recarregam. Quadros do cliente são limitados a 1 KiB. Um cliente que não acompanha (mais de 4 MB acumulados) é desconectado e reconecta com um snapshot novo.

## Relacionado

- [Contratos](contracts.md)
- [Modelo de segurança local](../explanation/security.md)
