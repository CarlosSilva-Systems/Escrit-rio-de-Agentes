import type { ptBR } from './pt-BR';

// Same key set as pt-BR.ts (enforced by the type below and by the parity test).
export const en: Record<keyof typeof ptBR, string> = {
  'server.started': 'Team Office listening on http://127.0.0.1:{port}',
  'server.stopping': 'Shutting down Team Office…',
  'server.portInUse':
    'Port {port} is already in use{owner}. The Office never switches ports on its own: stop the process using it or change ESCRITORIO_PORT.',
  'server.portOwner': ' by process {name} (PID {pid})',
  'server.listenFailed': 'Could not open port {port}: {reason}',
  'server.invalidEnv': 'Invalid environment configuration: {reason}',
  'server.webMissing': 'The web interface has not been built yet. Run "npm run build".',
  'server.aclWarning':
    'Could not restrict the permissions of file {file} (icacls). Please check manually.',
  'server.configInvalidField': 'Field "{field}" in config.json is invalid: using the default.',
  'http.unauthorized.title': 'Unauthorized access',
  'http.unauthorized.body':
    'Open the Office with the "Escritório dos Agentes" shortcut (or run "npm run open").',
  'error.unauthorized': 'Unauthorized.',
  'error.forbidden': 'Request refused.',
  'error.notFound': 'Not found.',
  'error.invalidRequest': 'Invalid request.',
  'error.payloadTooLarge': 'Request body too large.',
  'error.rateLimited': 'Too many requests. Try again shortly.',
  'error.internal': 'Internal server error.',
  'cli.usage':
    'Usage: escritorio <command>\n  start          start the server (in the background) if it is down\n  open           start if needed and open the browser already signed in\n  stop           stop the server\n  status         show whether it is running\n  token:rotate   generate new tokens and invalidate sessions\n  team:check     check QUADRO.md x escritorio.json x map\n  team:init      create escritorio.json from the approved proposal\n  hooks:sync     copy the hook to ~/.escritorio-equipe/bin and build claude-settings.json\n  settings:diff  show the proposed settings.json diff (changes nothing)\n  settings:apply apply the diff (backup + APLICAR confirmation)\n  settings:revert remove only what the Office added',
  'cli.unknownCommand': 'Unknown command: {command}',
  'cli.alreadyRunning': 'The Office is already running at http://127.0.0.1:{port} (PID {pid}).',
  'cli.starting': 'Starting the Office…',
  'cli.started': 'Office running at http://127.0.0.1:{port} (PID {pid}).',
  'cli.startTimeout':
    'The Office did not become healthy within {seconds} s. See the log at {logFile}.',
  'cli.startFailed': 'The server exited while starting (code {code}). See the log at {logFile}.',
  'cli.serverEntryMissing': 'Compiled server not found ({file}). Run "npm run build".',
  'cli.opening': 'Opening the browser…',
  'cli.openUrl': 'Access URL (single use, 60 s): {url}',
  'cli.openFailed': 'Could not open the browser: {reason}',
  'cli.ticketFailed': 'The server refused to issue the access ticket (HTTP {status}).',
  'cli.notRunning': 'The Office is not running.',
  'cli.statusRunning': 'Running: http://127.0.0.1:{port} · PID {pid} · version {version}',
  'cli.stopped': 'Office stopped.',
  'cli.stopForced': 'The server did not answer the shutdown request; process was killed.',
  'cli.stopNotOwner':
    'Did not kill PID {pid}: it does not own the Office port (stale runtime.json?).',
  'cli.stopFailed': 'Could not stop the server.',
  'cli.tokenRotated':
    'Tokens regenerated. All browser sessions were invalidated; use "escritorio open" to sign in again.',
  'cli.error': 'Error: {reason}',
};
