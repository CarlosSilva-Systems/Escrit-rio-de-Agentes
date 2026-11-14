import { describe, expect, it } from 'vitest';
import { desktopNotDetected } from './desktopHint';

describe('Desktop sessions hint', () => {
  it('CA-18: shown at Level 0 when nothing has arrived', () => {
    expect(desktopNotDetected({})).toBe(true);
    expect(desktopNotDetected({ 'settings.level': 0, 'office.events': 0, 'jsonl.events': 0 })).toBe(
      true,
    );
  });
  it('CA-18: hidden once any hook or JSONL event arrived, or when hooks are installed', () => {
    expect(desktopNotDetected({ 'office.events': 1 })).toBe(false);
    expect(desktopNotDetected({ 'jsonl.events': 3 })).toBe(false);
    expect(desktopNotDetected({ 'ingest.accepted': 2 })).toBe(false);
    expect(desktopNotDetected({ 'settings.level': 1 })).toBe(false);
  });
});
