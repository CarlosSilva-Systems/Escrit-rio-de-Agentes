import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION } from './contracts';

describe('smoke', () => {
  it('CA-25: test runner and shared module wiring work', () => {
    expect(PROTOCOL_VERSION).toBe(1);
  });
});
