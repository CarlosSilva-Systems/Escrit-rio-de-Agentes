# Tutorial: primeiro uso

[🇺🇸 English](../../en/tutorials/first-use.md) · [Índice da documentação](../README.md)

Em uns 15 minutos você instala o Escritório da Equipe, abre e aprende a tela inteira da Fase 1. Não precisa entender de código.

Você precisa de: Windows 11, Node.js 26 (`node --version` mostra `v26.x`), Git, npm e Microsoft Edge ou Chrome.

## 1. Instalar

Abra um terminal (PowerShell) na pasta onde você guarda seus projetos.

```
git clone <url-do-repositorio> escritorio-equipe
cd escritorio-equipe
npm ci
npm run build
```

O `npm ci` instala as versões exatas travadas; o `npm run build` cria a pasta `dist`. Cada um leva um ou dois minutos. A compilação termina sem erros.

## 2. Abrir o escritório

Dê dois cliques em `scripts\abrir-escritorio-dev.bat` (ou rode `npm run open`).

O console mostra "Ligando o Escritório…" e depois "Abrindo o navegador…", e o navegador abre em `http://127.0.0.1:3200/` já logado. A barra de endereço não mostra nenhum token: o atalho entregou ao navegador um ticket de uso único que já foi consumido.

Se a página disser "Abra o escritório pelo atalho", você digitou o endereço à mão. Feche a aba e use o atalho de novo.

## 3. Olhar a tela

Você vê o andar do escritório em pixel art e, em cima, a barra superior:

- **Nome do estúdio** à esquerda (um nome provisório até o `escritorio.json` existir) e o **relógio de Brasília**.
- **Agentes n/16 trabalhando** e **Projetos ativos**.
- Botões: **Equipe**, **Som**, **Idioma** e **Configurações**.

Enquanto o arquivo `~/.claude/equipe/escritorio.json` não existe, aparece um aviso fino: "Usando a equipe de reserva do QUADRO.md: o escritorio.json ainda não foi criado." O escritório funciona normalmente: a equipe vem do `QUADRO.md`. Você pode fechar o aviso em **Dispensar**. Para criar o arquivo de verdade, veja [Personalizar os NPCs](../how-to/customize-npcs.md).

Outro aviso pode dizer "Sessões do Claude Desktop não detectadas". É só informativo: veja [Ver sessões do Claude Desktop](../how-to/see-desktop-sessions.md).

## 4. Andar pelo mapa

1. Gire a roda do mouse sobre o mapa. O zoom salta entre 2×, 3× e 4× (nunca fica borrado).
2. Arraste o mapa com o botão esquerdo para movê-lo. Também dá para usar as setas do teclado, `+` / `-` ou os botões de zoom.
3. Clique no minimapa (canto inferior direito) para ir direto àquela parte do andar.

## 5. Conhecer os NPCs

1. Passe o mouse sobre um personagem. Em instantes um cartão mostra o nome completo, o cargo, o departamento, o status e há quanto tempo ele está nesse status.
2. Clique no personagem. Abre um painel lateral com o **Histórico recente**, as **Tarefas atuais** e uma linha "Tokens hoje" que mostra "—" (chega na Fase 3).
3. Clique no chão vazio, ou aperte `Esc`, para fechar o painel.

O status sempre aparece também escrito, não só como ícone: "Parado", "Trabalhando em … no projeto …" ou "Aguardando aprovação".

## 6. Usar a gaveta da Equipe

1. Aperte o botão **Equipe**. Abre a lista de todos os agentes.
2. Aperte **Seguir** numa linha. A câmera passa a acompanhar aquele NPC. No topo aparece "Seguindo: <nome>".
3. Aperte `Esc` (ou **Parar de seguir**) para soltar. Mover o mapa à mão também para de seguir.

## 7. Experimentar o teclado

Aperte `?` para ver a lista de atalhos (também em **Configurações → Atalhos de teclado**).

| Tecla | Abre |
|---|---|
| `C` | Chat com o Diretor (Fase 2: por enquanto mostra "Esta área chega nas próximas etapas.") |
| `T` | Tarefas (Fase 3: aviso provisório) |
| `A` | Aprovações "Precisa de você" (Fase 2: aviso provisório) |
| `M` | Mapa |
| `Esc` | Fecha a camada mais interna |

Os atalhos não funcionam enquanto você digita num campo de texto. Aperte `Tab` para percorrer todos os controles; o foco é sempre visível.

## 8. Trocar o idioma

Aperte o botão de idioma. Todos os textos passam para inglês (ou voltam para português) sem recarregar. O padrão é português.

## 9. Ver o escritório reagir (demonstração)

Sem hooks instalados, um escritório parado fica quieto. Para ver movimento, acrescente um parâmetro de demonstração ao endereço: `http://127.0.0.1:3200/?demo=8`. Oito personagens de demonstração passam a andar. Tire o parâmetro para voltar. (Os parâmetros de demonstração e depuração só mudam o que você vê; nunca chegam ao servidor. Veja a [referência de controles](../reference/controls.md).)

Para ver um agente de verdade trabalhando é preciso atividade do Claude Code: [Ver sessões do Claude Desktop](../how-to/see-desktop-sessions.md).

## 10. Encerrar

Fechar a aba deixa o servidor rodando em segundo plano (ele usa quase nada de CPU). Para desligar:

```
node dist/cli.js stop
```

Para deixar o escritório deslogado, abra **Configurações → Sair** e confirme; as suas sessões do Claude Code não são afetadas. O próximo `npm run open` liga o servidor de novo e entra por você. Se depois o navegador mostrar "Abra o escritório pelo atalho" (a sessão expirou), é só usar o atalho outra vez.

## Próximos passos

- [Personalizar os NPCs](../how-to/customize-npcs.md)
- [Solução de problemas](../how-to/troubleshooting.md)
- [Por que foi construído assim](../explanation/architecture.md)
