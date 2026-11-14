import { cpSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const defaultOutDir = fileURLToPath(new URL('./dist/web', import.meta.url));

/**
 * Publishes `assets/` (map, tilesets, sprites, fonts) at `/assets/` and, when present, the git-ignored
 * `assets-private/` at `/assets-private/` (paid art that cannot be redistributed). The web app loads
 * both through a manifest, so the code works with placeholders when they do not exist (CLAUDE.md).
 */
function copyAssets(): Plugin {
  let outDir = defaultOutDir;
  return {
    name: 'escritorio-copy-assets',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      for (const name of ['assets', 'assets-private']) {
        const from = `${repoRoot}${name}`;
        if (existsSync(from)) cpSync(from, `${outDir}/${name}`, { recursive: true });
      }
    },
  };
}

// Dev mode never uses the Vite dev server (ADR-0007): the Fastify server serves dist/web.
export default defineConfig({
  root: fileURLToPath(new URL('./src/web', import.meta.url)),
  // Optional art manifests: the app only requests them when they exist at build time (no 404 noise).
  define: {
    __SPRITE_MANIFESTS__: JSON.stringify({
      public: existsSync(`${repoRoot}assets/sprites/manifest.json`),
      private: existsSync(`${repoRoot}assets-private/sprites/manifest.json`),
    }),
  },
  plugins: [react(), copyAssets()],
  build: {
    outDir: defaultOutDir,
    // Keeps Vite's hashed bundles out of /assets/, which belongs to the art and map files.
    assetsDir: 'bundle',
    emptyOutDir: true,
    // Source maps only for `npm run dev` (vite build --watch); production builds ship none.
    sourcemap: process.argv.includes('--watch'),
  },
});
