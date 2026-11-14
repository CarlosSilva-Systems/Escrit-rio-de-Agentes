// `npm run credits:check` (CLAUDE.md, T-23): every file under assets/ must be credited in BOTH
// CREDITS.md and CREDITS.pt-BR.md, and every font credited as OFL must ship its OFL license text
// next to it. Plain Node, no dependencies. Exit code 1 on any finding.
//
// Coverage rule: a credits file covers an asset when it mentions the asset's relative path, its
// file name, or a backticked glob (`assets/fonts/Silkscreen-*.ttf`) that matches it. License
// texts (`*OFL*.txt`, `LICENSE*`) are covered through the font they accompany. `assets/map/` is
// project-authored data (not a third-party asset) and is exempt.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, posix, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FONT_EXT = /\.(ttf|otf|woff2?)$/i;
const LICENSE_FILE = /(^|[-_.])(OFL|LICENSE|LICENCE)[^/]*\.txt$|^LICENSE/i;
const EXEMPT_PREFIXES = ['assets/map/'];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const globToRegExp = (glob) =>
  new RegExp(
    `^${glob
      .split('*')
      .map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
      .join('[^/]*')}$`,
  );

/** Asset paths (posix, relative to the repo root) mentioned by a credits text, plus its globs. */
function mentions(text, rel) {
  const base = posix.basename(rel);
  if (text.includes(rel) || text.includes(base)) return true;
  for (const m of text.matchAll(/`([^`\n]*assets\/[^`\n]*)`/g)) {
    if ((m[1] ?? '').includes('*') && globToRegExp(m[1]).test(rel)) return true;
  }
  return false;
}

/** The credits line that covers `rel` (for the "credited as OFL" test). */
function lineFor(text, rel) {
  const base = posix.basename(rel);
  return (
    text.split('\n').find((l) => l.includes(rel) || l.includes(base)) ??
    text
      .split('\n')
      .find((l) =>
        [...l.matchAll(/`([^`]*\*[^`]*)`/g)].some((m) => globToRegExp(m[1]).test(rel)),
      ) ??
    ''
  );
}

export function checkCredits({ root = ROOT } = {}) {
  const problems = [];
  const assetsDir = join(root, 'assets');
  if (!existsSync(assetsDir)) return { files: 0, problems };
  const credits = ['CREDITS.md', 'CREDITS.pt-BR.md'].map((name) => {
    const path = join(root, name);
    return { name, text: existsSync(path) ? readFileSync(path, 'utf8') : null };
  });
  for (const c of credits) if (c.text === null) problems.push(`${c.name} does not exist`);

  const files = walk(assetsDir)
    .map((f) => relative(root, f).split('\\').join('/'))
    .filter((rel) => !EXEMPT_PREFIXES.some((p) => rel.startsWith(p)));

  for (const rel of files) {
    if (LICENSE_FILE.test(posix.basename(rel))) continue; // covered through its font
    for (const c of credits) {
      if (c.text !== null && !mentions(c.text, rel)) {
        problems.push(`${rel}: no entry in ${c.name}`);
      }
    }
    if (FONT_EXT.test(rel)) {
      const dir = posix.dirname(rel);
      const family = posix.basename(rel).split(/[-.]/)[0] ?? '';
      const asOfl = credits.some((c) => c.text !== null && /OFL/i.test(lineFor(c.text, rel)));
      const hasLicense = files.some(
        (f) =>
          posix.dirname(f) === dir &&
          /OFL/i.test(posix.basename(f)) &&
          (posix.basename(f).toLowerCase().startsWith(family.toLowerCase()) ||
            posix.basename(f).toUpperCase() === 'OFL.TXT'),
      );
      if (asOfl && !hasLicense)
        problems.push(`${rel}: credited as OFL but no OFL license text next to it`);
    }
  }
  return { files: files.length, problems };
}

if (
  process.argv[1] &&
  import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href
) {
  const { files, problems } = checkCredits();
  if (problems.length > 0) {
    console.error(`credits:check FAILED (${problems.length})`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`credits:check OK (${files} asset file(s) credited)`);
}
