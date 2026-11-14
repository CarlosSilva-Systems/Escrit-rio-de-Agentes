import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadServerEnv, resolveDefaultDevRoot } from './env';

describe('default dev root (I2: no personal path in code)', () => {
  const home = join('H', 'user');
  it('CA-27: prefers the OneDrive Documentos folder when it exists', () => {
    const od = join('H', 'user', 'OneDrive');
    const want = join(od, 'Documentos', '7 - DEV');
    expect(resolveDefaultDevRoot({ OneDrive: od }, home, (p) => p === want)).toBe(want);
  });

  it('CA-27: falls back to plain Documents when nothing exists', () => {
    expect(resolveDefaultDevRoot({}, home, () => false)).toBe(join(home, 'Documents', '7 - DEV'));
  });

  it('CA-27: ESCRITORIO_DEV_ROOT always wins', () => {
    const env = loadServerEnv({ ESCRITORIO_DEV_ROOT: 'X:/dev' } as NodeJS.ProcessEnv);
    expect(env.devRoot).toBe('X:/dev');
  });
});
