import { describe, expect, it } from 'vitest';
import { isTextEntryTarget, resolveShortcut, type ElementLike } from './keyboard';

const el = (
  tagName: string,
  attrs: Record<string, string> = {},
  extra: Partial<ElementLike> = {},
): ElementLike => ({
  tagName: tagName.toUpperCase(),
  getAttribute: (name) => attrs[name] ?? null,
  closest: () => null,
  ...extra,
});

describe('text-entry detection', () => {
  it.each([
    ['textarea', el('textarea')],
    ['select', el('select')],
    ['text input', el('input', { type: 'text' })],
    ['input without type', el('input')],
    ['password input', el('input', { type: 'password' })],
    ['contenteditable', el('div', {}, { isContentEditable: true })],
    ['role=textbox', el('div', { role: 'textbox' })],
    ['inside the terminal', el('div', {}, { closest: () => ({}) })],
  ])('CA-23: %s is a text-entry target', (_name, target) => {
    expect(isTextEntryTarget(target)).toBe(true);
  });

  it.each([
    ['button', el('button')],
    ['canvas', el('canvas')],
    ['checkbox', el('input', { type: 'checkbox' })],
    ['body', el('body')],
    ['link', el('a')],
  ])('CA-23: %s is not a text-entry target', (_name, target) => {
    expect(isTextEntryTarget(target)).toBe(false);
  });

  it('CA-23: null and non-objects are not text targets', () => {
    expect(isTextEntryTarget(null)).toBe(false);
    expect(isTextEntryTarget('x')).toBe(false);
  });
});

describe('shortcut resolution', () => {
  const body = el('body');

  it('CA-23: C, T, A and M open chat, tasks, approvals and map (any case)', () => {
    expect(resolveShortcut({ key: 'c', target: body })).toBe('chat');
    expect(resolveShortcut({ key: 'T', target: body })).toBe('tasks');
    expect(resolveShortcut({ key: 'a', target: body })).toBe('approvals');
    expect(resolveShortcut({ key: 'M', target: body })).toBe('map');
  });

  it('CA-23: nothing fires while typing in a text field', () => {
    for (const target of [
      el('input', { type: 'text' }),
      el('textarea'),
      el('select'),
      el('div', {}, { isContentEditable: true }),
    ]) {
      for (const key of ['c', 't', 'a', 'm', '?']) {
        expect(resolveShortcut({ key, target }), `${key} in ${target.tagName}`).toBeNull();
      }
    }
  });

  it('CA-23: Escape always resolves so panels and modals can close from anywhere', () => {
    expect(resolveShortcut({ key: 'Escape', target: el('textarea') })).toBe('escape');
    expect(resolveShortcut({ key: 'Escape', target: body })).toBe('escape');
  });

  it('CA-23: browser shortcuts (Ctrl/Cmd/Alt+key), key repeat and IME composition are ignored', () => {
    expect(resolveShortcut({ key: 'c', ctrlKey: true, target: body })).toBeNull();
    expect(resolveShortcut({ key: 'a', metaKey: true, target: body })).toBeNull();
    expect(resolveShortcut({ key: 't', altKey: true, target: body })).toBeNull();
    expect(resolveShortcut({ key: 'c', repeat: true, target: body })).toBeNull();
    expect(resolveShortcut({ key: 'c', isComposing: true, target: body })).toBeNull();
  });

  it('CA-23: events already handled by a component are not handled twice', () => {
    expect(resolveShortcut({ key: 'Escape', defaultPrevented: true, target: body })).toBeNull();
  });

  it('CA-23: "?" opens help and other keys do nothing', () => {
    expect(resolveShortcut({ key: '?', target: body })).toBe('help');
    expect(resolveShortcut({ key: 'x', target: body })).toBeNull();
    expect(resolveShortcut({ key: 'Enter', target: body })).toBeNull();
  });

  it('CA-37: no letter shortcut can approve or deny (there is no such action)', () => {
    const actions = new Set(
      ['c', 't', 'a', 'm', 'y', 'n', 'd', 'l', 'p'].map((key) =>
        resolveShortcut({ key, target: body }),
      ),
    );
    expect([...actions].filter(Boolean).sort()).toEqual(['approvals', 'chat', 'map', 'tasks']);
  });
});
