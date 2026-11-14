// Bundles the server and the CLI with esbuild (ADR-0007): dist/server/index.js and dist/cli.js.
// Our own code is bundled; npm packages stay external (resolved from node_modules at runtime).
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('..', import.meta.url));

export async function buildServer({ outdir = 'dist' } = {}) {
  await build({
    absWorkingDir: root,
    entryPoints: { 'server/index': 'src/server/main.ts', cli: 'src/cli/escritorio.ts' },
    outdir,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node26',
    packages: 'external',
    sourcemap: true,
    logLevel: 'warning',
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await buildServer();
  console.log('server + cli built in dist/');
}
