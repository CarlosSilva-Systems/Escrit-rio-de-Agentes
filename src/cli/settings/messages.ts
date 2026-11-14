// CLI messages for `settings:*` and `hooks:sync` (pt-BR default, en alternative). The key set is
// identical in both languages (checked by a test).

import type { Lang } from '../../server/i18n';

type Catalog = Record<string, string>;

const ptBR: Catalog = {
  'usage.text':
    'Uso:\n  settings:diff   [--level 1|2] [--settings-file <arquivo>]\n  settings:apply  --level 1|2 [--confirm APLICAR] [--settings-file <arquivo>] [--i-am-carlo-and-approved]\n  settings:revert [--settings-file <arquivo>] [--i-am-carlo-and-approved]\n  hooks:sync      [--settings-file <arquivo>]\n\nO settings.json REAL (~/.claude/settings.json) só é alterado com a flag --i-am-carlo-and-approved, depois do OK do Carlos sobre o diff.',
  'usage.unknown-option': 'Opção desconhecida ou sem valor: {option}',
  'usage.bad-level': 'Nível inválido: use --level 1 ou --level 2.',
  'usage.level-required': 'settings:apply exige --level 1 ou --level 2.',
  'diff.header': 'Arquivo: {file}\nNível proposto: {level}',
  'diff.nothing': 'Nada a alterar: o que este nível acrescentaria já está no arquivo.',
  'diff.file-missing': 'O arquivo não existe: seria criado com o conteúdo abaixo.',
  'diff.summary-hooks': 'Eventos de hook a acrescentar ({count}): {events}',
  'diff.summary-present': 'Eventos que já têm o hook do Escritório ({count}): {events}',
  'diff.summary-statusline': 'statusLine: {action}',
  'diff.statusline.wrapped': 'o comando atual passa a ser envolvido (guardado em --wrap)',
  'diff.statusline.created': 'seria criada (não existe hoje)',
  'diff.statusline.already-present': 'já está envolvida pelo Escritório',
  'diff.statusline.unchanged': 'inalterada',
  'diff.untouched':
    'Nada é removido; as demais chaves ficam como estão. Este comando não grava nada.',
  'diff.script-missing':
    'Atenção: o script {script} ainda não está em {dir}. Rode hooks:sync antes de aplicar.',
  'apply.real-refused':
    'Recusado: este é o settings.json real. Mostre o diff ao Carlos e, só com o OK dele, repita com --i-am-carlo-and-approved.',
  'apply.confirm-required': 'Recusado: a confirmação precisa ser exatamente {word}.',
  'apply.prompt': 'Digite {word} para aplicar: ',
  'apply.script-missing': 'O script {script} não está em {dir}. Rode hooks:sync primeiro.',
  'apply.done': 'Aplicado. Backup: {backup}',
  'apply.done-no-backup': 'Aplicado (o arquivo não existia, não há backup).',
  'apply.unchanged': 'Nada a fazer: já estava aplicado.',
  'apply.validation-failed':
    'A validação depois da gravação falhou; o arquivo original foi restaurado.',
  'revert.real-refused':
    'Recusado: este é o settings.json real. Repita com --i-am-carlo-and-approved se for isso mesmo.',
  'revert.file-missing': 'O arquivo não existe: {file}',
  'revert.done': 'Revertido ({count} entrada(s) removida(s)). Backup do estado anterior: {backup}',
  'revert.restored': 'Bytes originais restaurados a partir de: {file}',
  'revert.statusline-restored': 'statusLine original restaurada.',
  'revert.statusline-removed': 'statusLine criada pelo Escritório removida.',
  'revert.unchanged': 'Nada do Escritório foi encontrado neste arquivo.',
  'error.invalid-json': 'O settings.json não é um JSON válido: nada foi alterado.',
  'error.not-object': 'O settings.json não é um objeto JSON: nada foi alterado.',
  'error.hooks-not-object': 'A chave "hooks" do settings.json não é um objeto: nada foi alterado.',
  'error.event-not-array': 'O evento "{detail}" em "hooks" não é uma lista: nada foi alterado.',
  'error.statusline-unsupported':
    'A statusLine atual tem um formato que não sei envolver com segurança: nada foi alterado.',
  'apply.marker-missing':
    'Recusado: a pasta dos scripts precisa conter ".escritorio-equipe" no caminho (é como o revert reconhece o que é nosso).',
  'sync.copied': 'Copiado para {dir}: {files} (versão do hook: {version})',
  'sync.session-settings': 'claude-settings.json do painel gravado em {file}',
  'sync.session-hooks-included': 'Nível 0: os hooks vão nas sessões do painel (--settings).',
  'sync.session-hooks-skipped':
    'Nível 1 detectado no settings.json: o arquivo do painel não repete os hooks.',
  'sync.source-missing': 'Não encontrei a pasta src/hook-runtime do projeto.',
  'sync.next':
    'O settings.json do Carlos NÃO foi tocado. Para o Nível 1: settings:diff e, com o OK, settings:apply.',
};

const en: Catalog = {
  'usage.text':
    'Usage:\n  settings:diff   [--level 1|2] [--settings-file <file>]\n  settings:apply  --level 1|2 [--confirm APLICAR] [--settings-file <file>] [--i-am-carlo-and-approved]\n  settings:revert [--settings-file <file>] [--i-am-carlo-and-approved]\n  hooks:sync      [--settings-file <file>]\n\nThe REAL settings.json (~/.claude/settings.json) is only changed with --i-am-carlo-and-approved, after Carlos approved the diff.',
  'usage.unknown-option': 'Unknown option or missing value: {option}',
  'usage.bad-level': 'Invalid level: use --level 1 or --level 2.',
  'usage.level-required': 'settings:apply requires --level 1 or --level 2.',
  'diff.header': 'File: {file}\nProposed level: {level}',
  'diff.nothing': 'Nothing to change: what this level would add is already in the file.',
  'diff.file-missing': 'The file does not exist: it would be created with the content below.',
  'diff.summary-hooks': 'Hook events to add ({count}): {events}',
  'diff.summary-present': 'Events that already have the Office hook ({count}): {events}',
  'diff.summary-statusline': 'statusLine: {action}',
  'diff.statusline.wrapped': 'the current command becomes wrapped (kept in --wrap)',
  'diff.statusline.created': 'would be created (none today)',
  'diff.statusline.already-present': 'already wrapped by the Office',
  'diff.statusline.unchanged': 'unchanged',
  'diff.untouched':
    'Nothing is removed; every other key stays as it is. This command writes nothing.',
  'diff.script-missing':
    'Note: script {script} is not in {dir} yet. Run hooks:sync before applying.',
  'apply.real-refused':
    'Refused: this is the real settings.json. Show the diff to Carlos and, only with his OK, repeat with --i-am-carlo-and-approved.',
  'apply.confirm-required': 'Refused: the confirmation must be exactly {word}.',
  'apply.prompt': 'Type {word} to apply: ',
  'apply.script-missing': 'Script {script} is not in {dir}. Run hooks:sync first.',
  'apply.done': 'Applied. Backup: {backup}',
  'apply.done-no-backup': 'Applied (the file did not exist, so there is no backup).',
  'apply.unchanged': 'Nothing to do: already applied.',
  'apply.validation-failed': 'Post-write validation failed; the original file was restored.',
  'revert.real-refused':
    'Refused: this is the real settings.json. Repeat with --i-am-carlo-and-approved if that is intended.',
  'revert.file-missing': 'The file does not exist: {file}',
  'revert.done': 'Reverted ({count} entries removed). Backup of the previous state: {backup}',
  'revert.restored': 'Original bytes restored from: {file}',
  'revert.statusline-restored': 'Original statusLine restored.',
  'revert.statusline-removed': 'statusLine created by the Office removed.',
  'revert.unchanged': 'Nothing from the Office was found in this file.',
  'error.invalid-json': 'settings.json is not valid JSON: nothing was changed.',
  'error.not-object': 'settings.json is not a JSON object: nothing was changed.',
  'error.hooks-not-object':
    'The "hooks" key of settings.json is not an object: nothing was changed.',
  'error.event-not-array': 'Event "{detail}" under "hooks" is not a list: nothing was changed.',
  'error.statusline-unsupported':
    'The current statusLine has a shape I cannot wrap safely: nothing was changed.',
  'apply.marker-missing':
    'Refused: the scripts folder path must contain ".escritorio-equipe" (that is how revert recognizes what is ours).',
  'sync.copied': 'Copied to {dir}: {files} (hook version: {version})',
  'sync.session-settings': "The panel's claude-settings.json was written to {file}",
  'sync.session-hooks-included': 'Level 0: hooks go to panel sessions (--settings).',
  'sync.session-hooks-skipped':
    'Level 1 detected in settings.json: the panel file does not repeat the hooks.',
  'sync.source-missing': 'Could not find the project src/hook-runtime folder.',
  'sync.next':
    "Carlos's settings.json was NOT touched. For Level 1: settings:diff and, once approved, settings:apply.",
};

export const SETTINGS_CATALOGS: Record<Lang, Catalog> = { 'pt-BR': ptBR, en };

export function msg(lang: Lang, key: string, params: Record<string, string | number> = {}): string {
  const template = SETTINGS_CATALOGS[lang][key] ?? SETTINGS_CATALOGS['pt-BR'][key] ?? key;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in params ? String(params[name]) : whole,
  );
}
