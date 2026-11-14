import { describe, expect, it } from 'vitest';
import { validateProjectName } from './projectName';

describe('validateProjectName', () => {
  it.each(['Sites', 'escritorio-equipe', 'Projeto Ação (v2)', 'app_1.0', 'Café'])(
    'CA-28: accepts %s',
    (name) => {
      expect(validateProjectName(name)).toEqual({ ok: true, name });
    },
  );

  it.each([
    ['', 'empty'],
    ['.', 'dot-segment'],
    ['..', 'dot-segment'],
    ['a/b', 'invalid-chars'],
    ['a\\b', 'invalid-chars'],
    ['C:evil', 'invalid-chars'],
    ['\\\\server\\share', 'invalid-chars'],
    ['name ', 'dot-or-space-edge'],
    [' name', 'dot-or-space-edge'],
    ['.hidden', 'dot-or-space-edge'],
    ['name.', 'dot-or-space-edge'],
    ['CON', 'reserved-name'],
    ['nul.txt', 'reserved-name'],
    ['Com1', 'reserved-name'],
    ['PROGRA~1', 'invalid-chars'],
    ['x'.repeat(101), 'too-long'],
  ])('CA-29: rejects %j (%s)', (name, error) => {
    expect(validateProjectName(name)).toEqual({ ok: false, error });
  });

  it('CA-29: rejects non-string input', () => {
    expect(validateProjectName(42)).toEqual({ ok: false, error: 'empty' });
    expect(validateProjectName(undefined)).toEqual({ ok: false, error: 'empty' });
  });
});
