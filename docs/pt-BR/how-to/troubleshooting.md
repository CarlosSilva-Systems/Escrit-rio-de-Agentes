# Solução de problemas

[🇺🇸 English](../../en/how-to/troubleshooting.md) · [Índice da documentação](../README.md)

Cada item é um sintoma seguido do que fazer. As mensagens da linha de comando saem no idioma salvo no `config.json` (português por padrão).

Os logs ficam em `%USERPROFILE%\.escritorio-equipe\logs\` (`server-stdout.log` para a partida, `escritorio-<data>.log` para o servidor). Eles nunca contêm prompts, respostas nem tokens.

## A porta 3200 está ocupada

**Sintoma:** o servidor encerra com código `3` e mostra "A porta 3200 já está em uso pelo processo node.exe (PID …). O Escritório nunca troca de porta sozinho…".

1. Rode `node dist/cli.js status`. Se disser "Ligado", o Escritório já está no ar: é só usar `npm run open`.
2. Se outro programa ocupa a porta, descubra qual: `netstat -ano | findstr :3200` e encerre esse processo, ou
3. Escolha outra porta: defina `ESCRITORIO_PORT` (por exemplo `$env:ESCRITORIO_PORT=3300` no PowerShell) antes de cada comando. O Escritório nunca escolhe porta sozinho.

(O Pixel Agents instalado usa a porta 3100, então não há conflito.)

## A página diz "Abra o escritório pelo atalho" (401)

Você abriu o endereço sem o ticket de uso único, o ticket já tinha sido usado ou passou de 60 segundos, a sessão expirou ou o token foi girado. Feche a aba e rode `npm run open` (ou o atalho `.bat`). O botão "Tentar de novo" dessa página só repete a mesma requisição.

## A sessão terminou sozinha

Uma sessão do navegador termina depois de 8 horas sem uso, ou 24 horas depois de iniciada. Reabra pelo atalho. Veja [Fazer logout](log-out.md).

## "Muitas requisições"

Você atingiu o limite de requisições (120 por minuto na API). Espere um instante. Se continuar acontecendo, algo está consultando o servidor em laço.

## `open` ou `start` reclama

- `Servidor compilado não encontrado (…). Rode "npm run build".` → rode `npm run build`.
- `O Escritório não ficou saudável em 20 s. Veja o log em …` ou `O servidor encerrou ao iniciar (código …)` → leia o fim do `server-stdout.log`. Causas comuns: porta ocupada ou variável de ambiente inválida.
- `Configuração de ambiente inválida: …` → corrija a variável citada (por exemplo, `ESCRITORIO_PORT` precisa ser um número de 1 a 65535).
- O navegador mostra `A interface web ainda não foi gerada. Rode "npm run build".` → rode `npm run build`.

## O `stop` se recusa a encerrar um processo

`Não matei o PID …: ele não é o dono da porta do Escritório (runtime.json desatualizado?)`. O servidor não respondeu ao desligamento educado e o PID salvo não é o que escuta a porta, então o comando se recusa a matar um desconhecido. Descubra o dono real com `netstat -ano | findstr :3200` e encerre você mesmo, ou apague `%USERPROFILE%\.escritorio-equipe\runtime.json` se nenhum Escritório estiver rodando.

## Um aviso amarelo ou azul no topo do escritório

| Aviso | Significado | O que fazer |
|---|---|---|
| "Usando a equipe de reserva do QUADRO.md: o escritorio.json ainda não foi criado." | Não existe `escritorio.json`; a equipe vem do `QUADRO.md`. É uma nota tranquila, não um erro. | Normal até você [criar o arquivo](customize-npcs.md). Pode dispensar. |
| Uma faixa de aviso como "Problema em escritorio.json · <campo>: valor inválido. Mantendo a última configuração válida." | O arquivo existe mas está inválido. Cada problema tem a sua frase traduzida (veja os [códigos de diagnóstico](../reference/contracts.md#códigos-de-diagnóstico)): JSON inválido, grande demais, valor inválido, formato fora do esperado, agente, mesa ou departamento repetido, departamento desconhecido, nenhum ou vários líderes, mesa ou sala ausente do mapa, mesa em sala de outro departamento. A última equipe válida continua. | Corrija o campo citado e salve; ele é relido sozinho. Confira com `npm run team:check`. |
| "Aviso sobre <arquivo> · <campo>. Detalhes no log do servidor." ou "Inconsistência entre escritorio.json, a equipe e o mapa" | Um arquivo discorda de outro (por exemplo uma mesa que não está no mapa, ou um problema no `QUADRO.md`). | Leia o log do servidor na pasta `logs` e corrija o arquivo citado. Confira com `npm run team:check`. |
| "Limite de Freelancers atingido: N evento(s) de agentes desconhecidos descartados." | Mais de 12 agentes desconhecidos (Freelancers) ficaram ativos ao mesmo tempo. | Acrescente ao `escritorio.json` os tipos que você usa; os demais são ignorados. |
| "N avisos ao carregar o mapa e a arte." | O mapa ou a arte tiveram avisos. | Abra a página com `?debug` para ver detalhes; rode `npm run team:check` para conferir o mapa contra a equipe. |

## "Sessões do Claude Desktop não detectadas"

O escritório não viu nenhum evento e o Nível 1 não está instalado. Causas possíveis:

1. Não houve atividade do Claude desde que o servidor ligou. Chame um agente no Claude Desktop e olhe de novo.
2. O Nível 0 lê `%USERPROFILE%\.claude\projects`. Se os dados do Claude ficam em outro lugar, defina `ESCRITORIO_CLAUDE_HOME`.
3. Para sessões em tempo real instale o Nível 1: [Ver sessões do Claude Desktop](see-desktop-sessions.md).

O aviso só conta eventos; não significa que algo esteja quebrado.

## Um agente trabalha mas aparece como visitante (Freelancer)

O `agent_type` dele não está no `escritorio.json`. Acrescente-o ([Personalizar os NPCs](customize-npcs.md)) e o visitante é trocado pelo NPC de verdade.

## "Sem conexão com o servidor" / "Servidor indisponível"

A página perdeu o servidor e tenta de novo com intervalos crescentes (de 1 s até 30 s). Confira `node dist/cli.js status`, ligue com `npm run open` se preciso, ou aperte "Tentar agora".

## Relacionado

- [Referência da CLI](../reference/cli.md)
- [Variáveis de ambiente](../reference/environment.md)
