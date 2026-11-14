import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkCredits } from '../../scripts/check-credits.mjs';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function repo(credits: string, files: string[]) {
  const root = mkdtempSync(join(tmpdir(), 'credits-'));
  dirs.push(root);
  for (const c of ['CREDITS.md', 'CREDITS.pt-BR.md']) writeFileSync(join(root, c), credits);
  for (const f of files) {
    mkdirSync(join(root, f, '..'), { recursive: true });
    writeFileSync(join(root, f), 'x');
  }
  return root;
}

describe('credits:check (GAP-01)', () => {
  it('CA-82: a credited font with its OFL text passes (glob entries count)', () => {
    const root = repo('| Fonts | A | SIL OFL 1.1 | `assets/fonts/Silk-*.ttf` |', [
      'assets/fonts/Silk-Bold.ttf',
      'assets/fonts/Silk-OFL.txt',
      'assets/map/mapa.json',
    ]);
    expect(checkCredits({ root })).toEqual({ files: 2, problems: [] });
  });

  it('CA-82: an asset without an entry is reported for both credit files', () => {
    const root = repo('| other | A | MIT | x |', ['assets/sfx/click.ogg']);
    expect(checkCredits({ root }).problems).toEqual([
      'assets/sfx/click.ogg: no entry in CREDITS.md',
      'assets/sfx/click.ogg: no entry in CREDITS.pt-BR.md',
    ]);
  });

  it('CA-82: an OFL font without the OFL text is reported', () => {
    const root = repo('| Font | A | SIL OFL 1.1 | `assets/fonts/Silk-Bold.ttf` |', [
      'assets/fonts/Silk-Bold.ttf',
    ]);
    expect(checkCredits({ root }).problems).toEqual([
      'assets/fonts/Silk-Bold.ttf: credited as OFL but no OFL license text next to it',
    ]);
  });

  it('CA-82: the real repository is fully credited', () => {
    expect(checkCredits().problems).toEqual([]);
  });
});
