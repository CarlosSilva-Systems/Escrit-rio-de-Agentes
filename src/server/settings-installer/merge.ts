import {
  fromBase64Url,
  isOurs,
  planHooks,
  statuslineCommand,
  type HookPlanOptions,
} from './hookCommand';

// Additive merge of the Office's hooks / statusLine into a parsed settings object, and its
// inverse. Pure and non-mutating (works on a structured clone). Nothing that exists is removed
// or rewritten, except the single `statusLine.command` value at Level 2 (reversible).

export type SettingsError = 'hooks-not-object' | 'event-not-array' | 'statusline-unsupported';

export interface MergeChanges {
  hooksAdded: string[];
  hooksAlreadyPresent: string[];
  statusLine: 'unchanged' | 'wrapped' | 'created' | 'already-present';
}

export type MergeResult =
  | { ok: true; settings: Record<string, unknown>; changes: MergeChanges }
  | { ok: false; code: SettingsError; detail?: string };

const isObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

/** true when a hook group (any shape) carries one of our commands. */
function groupHasOurs(group: unknown): boolean {
  if (!isObject(group) || !Array.isArray(group['hooks'])) return false;
  return group['hooks'].some((h) => isObject(h) && isOurs(h['command']));
}

/** Level 1: one group appended per event (nothing removed); skipped when ours is already there. */
export function addHooks(settings: Record<string, unknown>, options: HookPlanOptions): MergeResult {
  const next = structuredClone(settings);
  if (next['hooks'] !== undefined && !isObject(next['hooks'])) {
    return { ok: false, code: 'hooks-not-object' };
  }
  const hooks = (next['hooks'] ?? {}) as Record<string, unknown>;
  const changes: MergeChanges = {
    hooksAdded: [],
    hooksAlreadyPresent: [],
    statusLine: 'unchanged',
  };
  for (const [event, groups] of Object.entries(planHooks(options))) {
    const existing = hooks[event];
    if (existing !== undefined && !Array.isArray(existing)) {
      return { ok: false, code: 'event-not-array', detail: event };
    }
    if (Array.isArray(existing) && existing.some(groupHasOurs)) {
      changes.hooksAlreadyPresent.push(event);
      continue;
    }
    hooks[event] = [...(Array.isArray(existing) ? existing : []), ...groups];
    changes.hooksAdded.push(event);
  }
  if (changes.hooksAdded.length > 0) next['hooks'] = hooks;
  return { ok: true, settings: next, changes };
}

/** Level 2: wraps the existing statusLine command (kept inside `--wrap`, base64url). */
export function wrapStatusLine(
  settings: Record<string, unknown>,
  options: { binDir: string },
): MergeResult {
  const next = structuredClone(settings);
  const changes: MergeChanges = {
    hooksAdded: [],
    hooksAlreadyPresent: [],
    statusLine: 'unchanged',
  };
  const current = next['statusLine'];
  if (current === undefined) {
    next['statusLine'] = { type: 'command', command: statuslineCommand(options.binDir) };
    changes.statusLine = 'created';
    return { ok: true, settings: next, changes };
  }
  if (
    !isObject(current) ||
    current['type'] !== 'command' ||
    typeof current['command'] !== 'string'
  ) {
    return { ok: false, code: 'statusline-unsupported' };
  }
  if (isOurs(current['command'])) {
    changes.statusLine = 'already-present';
    return { ok: true, settings: next, changes };
  }
  current['command'] = statuslineCommand(options.binDir, current['command']);
  changes.statusLine = 'wrapped';
  return { ok: true, settings: next, changes };
}

export interface Detected {
  hooks: boolean;
  statusLine: boolean;
  /** 0 = nothing of ours, 1 = hooks installed, 2 = statusLine wrapped as well/instead. */
  level: 0 | 1 | 2;
}

export function detectInstalled(settings: Record<string, unknown>): Detected {
  const hooksObj = isObject(settings['hooks']) ? settings['hooks'] : {};
  const hooks = Object.values(hooksObj).some(
    (groups) => Array.isArray(groups) && groups.some(groupHasOurs),
  );
  const sl = settings['statusLine'];
  const statusLine = isObject(sl) && isOurs(sl['command']);
  return { hooks, statusLine, level: statusLine ? 2 : hooks ? 1 : 0 };
}

export interface RevertChanges {
  hookEntriesRemoved: number;
  statusLine: 'unchanged' | 'restored' | 'removed';
}

/** Removes only entries whose command carries the marker and restores the wrapped statusLine. */
export function removeOurs(settings: Record<string, unknown>): {
  settings: Record<string, unknown>;
  changes: RevertChanges;
} {
  const next = structuredClone(settings);
  const changes: RevertChanges = { hookEntriesRemoved: 0, statusLine: 'unchanged' };

  if (isObject(next['hooks'])) {
    const hooks = next['hooks'];
    for (const event of Object.keys(hooks)) {
      const groups = hooks[event];
      if (!Array.isArray(groups)) continue;
      const keptGroups: unknown[] = [];
      let touched = false;
      for (const group of groups) {
        if (!isObject(group) || !Array.isArray(group['hooks'])) {
          keptGroups.push(group);
          continue;
        }
        const entries = group['hooks'];
        const kept = entries.filter((h) => !(isObject(h) && isOurs(h['command'])));
        if (kept.length === entries.length) {
          keptGroups.push(group);
          continue;
        }
        touched = true;
        changes.hookEntriesRemoved += entries.length - kept.length;
        if (kept.length > 0) keptGroups.push({ ...group, hooks: kept });
      }
      if (!touched) continue;
      if (keptGroups.length > 0) hooks[event] = keptGroups;
      else delete hooks[event]; // an event we created: remove the empty key
    }
    // An emptied `hooks` object stays: it is harmless and the file keeps its shape.
  }

  const sl = next['statusLine'];
  if (isObject(sl) && isOurs(sl['command']) && typeof sl['command'] === 'string') {
    const m = /\s--wrap\s+([A-Za-z0-9_-]+)\s*$/.exec(sl['command']);
    if (m?.[1]) {
      sl['command'] = fromBase64Url(m[1]);
      changes.statusLine = 'restored';
    } else {
      delete next['statusLine']; // we had created it
      changes.statusLine = 'removed';
    }
  }
  return { settings: next, changes };
}
