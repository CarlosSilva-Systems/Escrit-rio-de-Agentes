import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildBaseline,
  defaultRoots,
  verify,
  type BaselineRoot,
} from '../../scripts/verify-baseline.mjs';

let dir: string;
let roots: BaselineRoot[];

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'baseline-'));
  mkdirSync(join(dir, 'pkg', 'dist'), { recursive: true });
  mkdirSync(join(dir, 'hooks'));
  mkdirSync(join(dir, 'launch'));
  writeFileSync(join(dir, 'pkg', 'package.json'), '{"a":1}');
  writeFileSync(join(dir, 'pkg', 'dist', 'index.js'), 'console.log(1)');
  writeFileSync(join(dir, 'hooks', 'claude-hook.js'), 'hook');
  writeFileSync(join(dir, 'hooks', 'characters.json'), 'secret-a');
  writeFileSync(join(dir, 'hooks', 'standalone-token'), 'secret-b');
  writeFileSync(join(dir, 'launch', 'abrir-escritorio.bat'), '@echo a');
  writeFileSync(join(dir, 'launch', 'iniciar-painel.bat'), '@echo b');
  roots = [
    { id: 'pkg', kind: 'tree', path: join(dir, 'pkg') },
    { id: 'hooks', kind: 'scripts', path: join(dir, 'hooks') },
    {
      id: 'launch',
      kind: 'files',
      path: join(dir, 'launch'),
      files: ['abrir-escritorio.bat', 'iniciar-painel.bat'],
    },
  ];
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('verify-baseline (CA-04)', () => {
  it('CA-04: unchanged targets are identical', () => {
    const baseline = buildBaseline(roots, new Date(0));
    expect(verify(baseline, roots)).toEqual({ identical: true, diffs: [] });
  });

  it('CA-04: tampering with a package file is detected', () => {
    const baseline = buildBaseline(roots);
    writeFileSync(join(dir, 'pkg', 'dist', 'index.js'), 'console.log(2)');
    const r = verify(baseline, roots);
    expect(r.identical).toBe(false);
    expect(r.diffs).toEqual(['ALTERADO  [pkg] dist/index.js']);
  });

  it('CA-04: tampering with a launcher .bat is detected', () => {
    const baseline = buildBaseline(roots);
    writeFileSync(join(dir, 'launch', 'abrir-escritorio.bat'), '@echo changed');
    expect(verify(baseline, roots).diffs).toEqual(['ALTERADO  [launch] abrir-escritorio.bat']);
  });

  it('CA-04: removed and added files are detected', () => {
    const baseline = buildBaseline(roots);
    rmSync(join(dir, 'hooks', 'claude-hook.js'));
    writeFileSync(join(dir, 'pkg', 'extra.txt'), 'x');
    const r = verify(baseline, roots);
    expect(r.diffs).toContain('REMOVIDO  [hooks] claude-hook.js');
    expect(r.diffs).toContain('ADICIONADO [pkg] extra.txt');
  });

  it('CA-04: secrets are neither recorded nor compared', () => {
    const baseline = buildBaseline(roots);
    expect(Object.keys(baseline.roots['hooks']?.files ?? {})).toEqual(['claude-hook.js']);
    expect(JSON.stringify(baseline.roots)).not.toMatch(/secret-|standalone-token|characters/);
    writeFileSync(join(dir, 'hooks', 'standalone-token'), 'rotated');
    expect(verify(baseline, roots).identical).toBe(true);
  });

  it('CA-04: aggregate is deterministic', () => {
    const a = buildBaseline(roots).roots['pkg']?.aggregate;
    expect(a).toBeTypeOf('string');
    expect(buildBaseline(roots).roots['pkg']?.aggregate).toBe(a);
  });

  it('CA-04: default roots point at the three real targets', () => {
    const ids = defaultRoots('C:\\h', 'C:\\h\\AppData\\Roaming').map((r) => r.id);
    expect(ids).toEqual(['pixel-agents-package', 'pixel-agents-hooks', 'pixel-agents-launchers']);
  });
});
