// Keyboard shortcut infrastructure (CA-23, WCAG 2.1.4). Pure: decides what a key press means.
// Single-letter shortcuts NEVER fire while the user is typing in a text field, and no shortcut
// ever approves or denies anything (decisions only by clicking the focused button).

export type ShortcutAction = 'chat' | 'tasks' | 'approvals' | 'map' | 'help' | 'escape';

export const LETTER_SHORTCUTS: Readonly<Record<string, ShortcutAction>> = {
  c: 'chat',
  t: 'tasks',
  a: 'approvals',
  m: 'map',
};

/** Minimal shape of an element, so this file runs in node tests without a DOM. */
export interface ElementLike {
  tagName?: string;
  isContentEditable?: boolean;
  getAttribute?: (name: string) => string | null;
  closest?: (selector: string) => unknown;
}

const TEXT_INPUT_TYPES = new Set([
  'text',
  'search',
  'url',
  'tel',
  'email',
  'password',
  'number',
  'date',
  'datetime-local',
  'month',
  'time',
  'week',
]);

/** True for anything the user can type into (and for the terminal, which captures every key). */
export function isTextEntryTarget(target: unknown): boolean {
  if (typeof target !== 'object' || target === null) return false;
  const el = target as ElementLike;
  const tag = el.tagName?.toLowerCase();
  if (tag === 'textarea' || tag === 'select') return true;
  if (tag === 'input') {
    const type = (el.getAttribute?.('type') ?? 'text').toLowerCase();
    return TEXT_INPUT_TYPES.has(type) || type === '';
  }
  if (el.isContentEditable) return true;
  const role = el.getAttribute?.('role');
  if (role === 'textbox' || role === 'searchbox' || role === 'combobox' || role === 'spinbutton')
    return true;
  // xterm.js renders a hidden textarea, but guard its container too.
  return Boolean(el.closest?.('.xterm, [contenteditable="true"], [data-captures-keys]'));
}

export interface KeyLike {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  repeat?: boolean;
  isComposing?: boolean;
  defaultPrevented?: boolean;
  target?: unknown;
}

/**
 * Maps a key press to a shortcut, or null. Rules:
 *  - letters (C/T/A/M) and "?" only outside text fields, without Ctrl/Meta/Alt, not repeated;
 *  - Escape always maps (the caller closes the innermost thing and decides whether to consume it);
 *  - events already handled elsewhere (defaultPrevented) or during IME composition are ignored.
 */
export function resolveShortcut(e: KeyLike): ShortcutAction | null {
  if (e.defaultPrevented || e.isComposing) return null;
  if (e.key === 'Escape') return 'escape';
  if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return null;
  if (isTextEntryTarget(e.target)) return null;
  if (e.key === '?') return 'help';
  return LETTER_SHORTCUTS[e.key.toLowerCase()] ?? null;
}
