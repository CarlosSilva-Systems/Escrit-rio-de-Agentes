// CLI messages for `team:*` commands, keyed (pt-BR default, en fallback). The key set is
// identical in both languages (checked by a test). Diagnostics are rendered by their `code`.

export type CliLang = 'pt-BR' | 'en';

type Catalog = Record<string, string>;

const ptBR: Catalog = {
  'check.title': 'Verificação da equipe',
  'check.files': 'QUADRO: {quadro} | escritorio: {escritorio} | mapa: {mapa}',
  'check.counts': '{quadro} agentes no QUADRO.md, {npcs} NPCs no escritorio.json',
  'check.map-skipped': 'mapa.json não encontrado em {path}: verificações de mesa/sala puladas',
  'check.ok': 'OK: equipe consistente.',
  'check.fail': 'FALHOU: {errors} erro(s), {warnings} aviso(s).',
  'check.quadro-missing': 'QUADRO.md não encontrado: {path}',
  'check.escritorio-missing': 'escritorio.json não encontrado: {path}',
  'check.map-missing': 'mapa.json não encontrado: {path}',
  'check.map-unreadable': 'mapa.json ilegível ou sem salas/mesas: {path}',
  'init.needs-confirm':
    'Recusado: team:init só roda com --confirm-approved (a lista de nomes precisa estar aprovada pelo Carlos, gate G1).',
  'init.proposal-missing': 'Proposta não encontrada: {path}',
  'init.proposal-invalid': 'A proposta é inválida; nada foi gravado.',
  'init.dest-exists':
    'O destino já existe: {path}. Nada foi alterado (use --overwrite para substituir; um backup é criado).',
  'init.written': 'Gravado: {path}',
  'init.backup': 'Backup do arquivo anterior: {path}',
  'init.next': 'Próximo passo: rode team:check contra o arquivo gravado.',
  'usage.text':
    'Uso:\n  team:check [--quadro <arquivo>] [--escritorio <arquivo>] [--mapa <arquivo>] [--lang pt-BR|en]\n  team:init --confirm-approved [--proposal <arquivo>] [--dest <arquivo>] [--overwrite]',
  'usage.unknown-option': 'Opção desconhecida ou sem valor: {option}',
  'usage.unknown-command': 'Comando desconhecido: {command}',
  'diag.team.file-missing': 'escritorio.json não existe',
  'diag.team.file-too-large': 'escritorio.json passa de 1 MiB',
  'diag.team.json-invalid': 'JSON inválido em escritorio.json{position}',
  'diag.team.field-invalid': 'Campo inválido {field}: {detail}',
  'diag.team.schema-invalid': 'Estrutura inválida: {detail}',
  'diag.team.more-issues': 'Há mais problemas não listados ({detail})',
  'diag.team.agent-duplicate': 'Agente duplicado: {agentType}',
  'diag.team.desk-duplicate': 'Mesa duplicada: {desk} está atribuída a mais de um agente',
  'diag.team.department-unknown': 'Departamento inválido: {department}',
  'diag.team.department-duplicate': 'Departamento duplicado',
  'diag.team.lead-count': 'Deve haver exatamente um agente com isLead=true',
  'diag.team.agent-without-npc':
    'Agente sem NPC: {agentType} está no QUADRO.md mas não no escritorio.json',
  'diag.team.npc-without-agent':
    'NPC sem agente: {agentType} está no escritorio.json mas não no QUADRO.md',
  'diag.team.desk-missing-in-map': 'Mesa inexistente no mapa: {desk} ({agentType})',
  'diag.team.desk-wrong-room':
    'Mesa {desk} está na sala {room}, que não é do departamento {department}',
  'diag.team.desk-null-not-provisional': 'Agente {agentType} sem mesa e sem marca de provisório',
  'diag.team.room-missing-in-map': 'Sala inexistente no mapa: {room}',
  'diag.quadro.no-agents': 'Nenhum agente encontrado na tabela "Equipe ativa" do QUADRO.md',
  'diag.quadro.row-invalid': 'Linha do QUADRO.md ignorada (nome de agente inválido)',
  'diag.quadro.agent-duplicate': 'Agente duplicado no QUADRO.md: {agentType}',
  'diag.quadro.too-many': 'Agentes demais no QUADRO.md',
  'severity.error': 'ERRO',
  'severity.warning': 'AVISO',
  'severity.info': 'INFO',
  unavailable: 'indisponível',
};

const en: Catalog = {
  'check.title': 'Team check',
  'check.files': 'QUADRO: {quadro} | escritorio: {escritorio} | map: {mapa}',
  'check.counts': '{quadro} agents in QUADRO.md, {npcs} NPCs in escritorio.json',
  'check.map-skipped': 'mapa.json not found at {path}: desk/room checks skipped',
  'check.ok': 'OK: team is consistent.',
  'check.fail': 'FAILED: {errors} error(s), {warnings} warning(s).',
  'check.quadro-missing': 'QUADRO.md not found: {path}',
  'check.escritorio-missing': 'escritorio.json not found: {path}',
  'check.map-missing': 'mapa.json not found: {path}',
  'check.map-unreadable': 'mapa.json unreadable or without rooms/desks: {path}',
  'init.needs-confirm':
    'Refused: team:init only runs with --confirm-approved (the name list must be approved by Carlos, gate G1).',
  'init.proposal-missing': 'Proposal not found: {path}',
  'init.proposal-invalid': 'The proposal is invalid; nothing was written.',
  'init.dest-exists':
    'Destination already exists: {path}. Nothing was changed (use --overwrite to replace; a backup is made).',
  'init.written': 'Written: {path}',
  'init.backup': 'Backup of the previous file: {path}',
  'init.next': 'Next step: run team:check against the written file.',
  'usage.text':
    'Usage:\n  team:check [--quadro <file>] [--escritorio <file>] [--mapa <file>] [--lang pt-BR|en]\n  team:init --confirm-approved [--proposal <file>] [--dest <file>] [--overwrite]',
  'usage.unknown-option': 'Unknown option or missing value: {option}',
  'usage.unknown-command': 'Unknown command: {command}',
  'diag.team.file-missing': 'escritorio.json does not exist',
  'diag.team.file-too-large': 'escritorio.json is larger than 1 MiB',
  'diag.team.json-invalid': 'Invalid JSON in escritorio.json{position}',
  'diag.team.field-invalid': 'Invalid field {field}: {detail}',
  'diag.team.schema-invalid': 'Invalid structure: {detail}',
  'diag.team.more-issues': 'More issues not listed ({detail})',
  'diag.team.agent-duplicate': 'Duplicate agent: {agentType}',
  'diag.team.desk-duplicate': 'Duplicate desk: {desk} is assigned to more than one agent',
  'diag.team.department-unknown': 'Invalid department: {department}',
  'diag.team.department-duplicate': 'Duplicate department',
  'diag.team.lead-count': 'Exactly one agent must have isLead=true',
  'diag.team.agent-without-npc':
    'Agent without NPC: {agentType} is in QUADRO.md but not in escritorio.json',
  'diag.team.npc-without-agent':
    'NPC without agent: {agentType} is in escritorio.json but not in QUADRO.md',
  'diag.team.desk-missing-in-map': 'Desk missing in the map: {desk} ({agentType})',
  'diag.team.desk-wrong-room':
    'Desk {desk} is in room {room}, which does not belong to department {department}',
  'diag.team.desk-null-not-provisional':
    'Agent {agentType} has no desk and is not marked provisional',
  'diag.team.room-missing-in-map': 'Room missing in the map: {room}',
  'diag.quadro.no-agents': 'No agents found in the "Equipe ativa" table of QUADRO.md',
  'diag.quadro.row-invalid': 'QUADRO.md row ignored (invalid agent name)',
  'diag.quadro.agent-duplicate': 'Duplicate agent in QUADRO.md: {agentType}',
  'diag.quadro.too-many': 'Too many agents in QUADRO.md',
  'severity.error': 'ERROR',
  'severity.warning': 'WARNING',
  'severity.info': 'INFO',
  unavailable: 'unavailable',
};

export const CLI_CATALOGS: Readonly<Record<CliLang, Catalog>> = { 'pt-BR': ptBR, en };

export function tr(
  lang: CliLang,
  key: string,
  params: Record<string, string | number> = {},
): string {
  const template = CLI_CATALOGS[lang][key] ?? CLI_CATALOGS.en[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_m, name: string) => String(params[name] ?? ''));
}
