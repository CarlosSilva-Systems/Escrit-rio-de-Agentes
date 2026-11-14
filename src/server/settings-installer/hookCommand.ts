// What the Office adds to Claude Code's settings (ADR-0004). Pure: only builds JSON values.
// Every command we add contains MARKER, which is how `revert` and the level detection recognize
// "ours" without touching anything else (Pixel Agents' entries never contain it).

export const MARKER = '.escritorio-equipe';
export const HOOK_SCRIPT = 'escritorio-hook.cjs';
export const STATUSLINE_SCRIPT = 'escritorio-statusline.cjs';

export interface HookEntry {
  type: 'command';
  command: string;
  timeout: number;
}
export interface HookGroup {
  matcher: string;
  hooks: HookEntry[];
}
export type HooksMap = Record<string, HookGroup[]>;

/** Events that already exist in Carlos's settings today (we append a group next to the current one). */
export const OBSERVED_EVENTS = [
  'SessionStart',
  'SessionEnd',
  'Stop',
  'Notification',
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'SubagentStart',
  'SubagentStop',
  'TaskCompleted',
] as const;

/** Events we add on top (not present today). */
export const NEW_EVENTS = ['UserPromptSubmit', 'TaskCreated'] as const;

export const OBSERVER_TIMEOUT_SEC = 3;
export const DEFAULT_APPROVAL_DEADLINE_SEC = 60;
/** Hook timeout of PermissionRequest = approval deadline + 15 s, so Claude never kills it first. */
export const permissionTimeout = (deadlineSec: number): number => deadlineSec + 15;

/** `C:\a\b` -> `C:/a/b` (Claude runs hook commands through a shell that prefers `/`). */
export function toForwardSlashes(path: string): string {
  return path.replace(/\\/g, '/');
}

export function hookCommand(binDir: string): string {
  return `node "${toForwardSlashes(binDir)}/${HOOK_SCRIPT}"`;
}

export function statuslineCommand(binDir: string, wrapped?: string): string {
  const base = `node "${toForwardSlashes(binDir)}/${STATUSLINE_SCRIPT}"`;
  return wrapped === undefined ? base : `${base} --wrap ${toBase64Url(wrapped)}`;
}

export const toBase64Url = (text: string): string =>
  Buffer.from(text, 'utf8').toString('base64url');
export const fromBase64Url = (text: string): string =>
  Buffer.from(text, 'base64url').toString('utf8');

export function hookGroup(binDir: string, timeout: number): HookGroup {
  return { matcher: '', hooks: [{ type: 'command', command: hookCommand(binDir), timeout }] };
}

export interface HookPlanOptions {
  binDir: string;
  approvalDeadlineSec?: number;
}

/** The hook groups Level 1 / the panel's `--settings` file contain, per event. */
export function planHooks(options: HookPlanOptions): HooksMap {
  const deadline = options.approvalDeadlineSec ?? DEFAULT_APPROVAL_DEADLINE_SEC;
  const map: HooksMap = {};
  for (const event of OBSERVED_EVENTS) {
    map[event] = [hookGroup(options.binDir, OBSERVER_TIMEOUT_SEC)];
  }
  map['PermissionRequest'] = [hookGroup(options.binDir, permissionTimeout(deadline))];
  for (const event of NEW_EVENTS) {
    map[event] = [hookGroup(options.binDir, OBSERVER_TIMEOUT_SEC)];
  }
  return map;
}

export const isOurs = (command: unknown): boolean =>
  typeof command === 'string' && command.includes(MARKER);
