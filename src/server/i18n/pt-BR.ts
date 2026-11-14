// Server-side messages (pt-BR is the source of the keys; en.ts must have the same set).
export const ptBR = {
  'server.started': 'Escritório da Equipe ouvindo em http://127.0.0.1:{port}',
  'server.stopping': 'Encerrando o Escritório da Equipe…',
  'server.portInUse':
    'A porta {port} já está em uso{owner}. O Escritório nunca troca de porta sozinho: encerre o processo que a ocupa ou ajuste ESCRITORIO_PORT.',
  'server.portOwner': ' pelo processo {name} (PID {pid})',
  'server.listenFailed': 'Não foi possível abrir a porta {port}: {reason}',
  'server.invalidEnv': 'Configuração de ambiente inválida: {reason}',
  'server.webMissing': 'A interface web ainda não foi gerada. Rode "npm run build".',
  'server.aclWarning':
    'Não foi possível restringir as permissões do arquivo {file} (icacls). Verifique manualmente.',
  'server.configInvalidField': 'Campo "{field}" de config.json inválido: usando o padrão.',
  'http.unauthorized.title': 'Acesso não autorizado',
  'http.unauthorized.body':
    'Abra o Escritório pelo atalho "Escritório dos Agentes" (ou rode "npm run open").',
  'error.unauthorized': 'Não autorizado.',
  'error.forbidden': 'Requisição recusada.',
  'error.notFound': 'Não encontrado.',
  'error.invalidRequest': 'Requisição inválida.',
  'error.payloadTooLarge': 'Corpo da requisição grande demais.',
  'error.rateLimited': 'Muitas requisições. Tente de novo em instantes.',
  'error.internal': 'Erro interno do servidor.',
  'cli.usage':
    'Uso: escritorio <comando>\n  start          liga o servidor (em segundo plano) se estiver desligado\n  open           liga se preciso e abre o navegador já logado\n  stop           desliga o servidor\n  status         mostra se está ligado\n  token:rotate   gera novos tokens e invalida as sessões\n  team:check     confere QUADRO.md x escritorio.json x mapa\n  team:init      cria o escritorio.json a partir da proposta aprovada\n  hooks:sync     copia o hook para ~/.escritorio-equipe/bin e gera o claude-settings.json\n  settings:diff  mostra o diff proposto do settings.json (não altera nada)\n  settings:apply aplica o diff (backup + confirmação APLICAR)\n  settings:revert remove só o que o Escritório acrescentou',
  'cli.unknownCommand': 'Comando desconhecido: {command}',
  'cli.alreadyRunning': 'O Escritório já está ligado em http://127.0.0.1:{port} (PID {pid}).',
  'cli.starting': 'Ligando o Escritório…',
  'cli.started': 'Escritório ligado em http://127.0.0.1:{port} (PID {pid}).',
  'cli.startTimeout': 'O Escritório não ficou saudável em {seconds} s. Veja o log em {logFile}.',
  'cli.startFailed': 'O servidor encerrou ao iniciar (código {code}). Veja o log em {logFile}.',
  'cli.serverEntryMissing': 'Servidor compilado não encontrado ({file}). Rode "npm run build".',
  'cli.opening': 'Abrindo o navegador…',
  'cli.openUrl': 'URL de acesso (uso único, 60 s): {url}',
  'cli.openFailed': 'Não foi possível abrir o navegador: {reason}',
  'cli.ticketFailed': 'O servidor recusou emitir o ticket de acesso (HTTP {status}).',
  'cli.notRunning': 'O Escritório não está ligado.',
  'cli.statusRunning': 'Ligado: http://127.0.0.1:{port} · PID {pid} · versão {version}',
  'cli.stopped': 'Escritório desligado.',
  'cli.stopForced':
    'O servidor não respondeu ao pedido de desligamento; processo encerrado à força.',
  'cli.stopFailed': 'Não foi possível desligar o servidor.',
  'cli.tokenRotated':
    'Tokens regenerados. Todas as sessões do navegador foram invalidadas; use "escritorio open" para entrar de novo.',
  'cli.error': 'Erro: {reason}',
} as const;
