// `npm run dev`: web build in watch mode + server in watch mode on 127.0.0.1:3200 (ADR-0007).
// No Vite dev server (it would add a second port and break the Host/Origin model): the Fastify
// server serves dist/web and you reload the page after each rebuild. Open it with `npm run open`.
import { execFile, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const node = process.execPath;

const children = [];
let stopping = false;

function run(label, args) {
  // node + script path, no shell: avoids .cmd shims and quoting problems on Windows.
  const child = spawn(node, args, { cwd: root, stdio: 'inherit', shell: false });
  children.push(child);
  child.on('exit', (code) => {
    if (!stopping) {
      console.error(`[dev] ${label} exited (code ${code}); stopping.`);
      stop(code ?? 1);
    }
  });
  return child;
}

function killTree(child) {
  if (!child.pid || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    execFile(
      'taskkill.exe',
      ['/PID', String(child.pid), '/T', '/F'],
      { windowsHide: true, shell: false },
      () => undefined,
    );
  } else {
    child.kill('SIGTERM');
  }
}

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) killTree(child);
  setTimeout(() => process.exit(code), 500).unref();
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

run('web', [
  fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url)),
  'build',
  '--watch',
]);
run('server', [
  fileURLToPath(new URL('../node_modules/tsx/dist/cli.mjs', import.meta.url)),
  'watch',
  'src/server/main.ts',
]);
console.log(
  `[dev] web build (watch) + server (watch) on 127.0.0.1:${process.env.ESCRITORIO_PORT || 3200}. Open with: npm run open`,
);
