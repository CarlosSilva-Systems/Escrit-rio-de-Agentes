import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveHomePaths } from '../../server/home/paths';
import type { CliContext } from '../launcher';
import { createSettingsCommands } from './commands';
import { SETTINGS_CATALOGS } from './messages';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'cli-settings-'));
  dirs.push(dir);
  const paths = resolveHomePaths(join(dir, '.escritorio-equipe'));
  mkdirSync(paths.binDir, { recursive: true });
  writeFileSync(join(paths.binDir, 'escritorio-hook.cjs'), '// stub');
  const file = join(dir, 'settings.json');
  const original = '{\n  "agent": "chefe",\n  "hooks": {}\n}\n';
  writeFileSync(file, original);
  const out: string[] = [];
  const err: string[] = [];
  const ctx = {
    env: { port: 3200, paths, devRoot: dir, logLevel: 'info', claudeBin: undefined },
    lang: 'pt-BR',
    out: (l: string) => out.push(l),
    err: (l: string) => err.push(l),
  } as CliContext;
  return { ctx, out, err, file, original };
}

describe('settings CLI (T-18)', () => {
  it('CA-20: message catalogs have the same keys in pt-BR and en', () => {
    expect(Object.keys(SETTINGS_CATALOGS.en).sort()).toEqual(
      Object.keys(SETTINGS_CATALOGS['pt-BR']).sort(),
    );
  });

  it('CA-20: settings:diff prints the diff and writes nothing', async () => {
    const { ctx, out, file, original } = setup();
    const code = await createSettingsCommands().diff(ctx, ['--settings-file', file]);
    expect(code).toBe(0);
    expect(out.join('\n')).toContain('+++ settings.json (proposto, nível 1)');
    expect(readFileSync(file, 'utf8')).toBe(original);
    expect(readdirSync(join(file, '..')).filter((n) => n.includes('.bak-'))).toEqual([]);
  });

  it('CA-20: settings:apply on a copy asks for APLICAR; a wrong word changes nothing', async () => {
    const { ctx, err, file, original } = setup();
    const wrong = createSettingsCommands({ ask: async () => 'sim' });
    expect(await wrong.apply(ctx, ['--level', '1', '--settings-file', file])).toBe(1);
    expect(err.join('\n')).toContain('APLICAR');
    expect(readFileSync(file, 'utf8')).toBe(original);

    const right = createSettingsCommands({ ask: async () => 'APLICAR' });
    expect(await right.apply(ctx, ['--level', '1', '--settings-file', file])).toBe(0);
    expect(readFileSync(file, 'utf8')).toContain('.escritorio-equipe');
    expect(await right.revert(ctx, ['--settings-file', file])).toBe(0);
    expect(readFileSync(file, 'utf8')).toBe(original);
  });

  it('CA-20: the REAL settings.json is refused without --i-am-carlo-and-approved (apply and revert)', async () => {
    const { ctx, err } = setup();
    let asked = false;
    const cmds = createSettingsCommands({
      ask: async () => {
        asked = true;
        return 'APLICAR';
      },
    });
    // No --settings-file = the real ~/.claude/settings.json: refused before anything is read or asked.
    expect(await cmds.apply(ctx, ['--level', '1'])).toBe(1);
    expect(await cmds.revert(ctx, [])).toBe(1);
    expect(asked).toBe(false);
    expect(err.join('\n')).toContain('--i-am-carlo-and-approved');
  });

  it('CA-20: unknown options and a missing level are usage errors', async () => {
    const { ctx } = setup();
    const cmds = createSettingsCommands();
    expect(await cmds.diff(ctx, ['--bogus'])).toBe(2);
    expect(await cmds.apply(ctx, [])).toBe(2);
    expect(await cmds.diff(ctx, ['--level', '9'])).toBe(2);
  });
});
