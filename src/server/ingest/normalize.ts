import {
  categorizeTool,
  type HookPayload,
  type OfficeEvent,
  type OfficeEventKind,
} from '../../shared/contracts';
import { cleanAgentId, extractTaskRef, safeSubject, type EventFactory } from '../../shared/events';
import { cwdToProject, type CwdProjectOptions } from '../jsonl/project';

// Hook payload -> OfficeEvent (ARQUITETURA §5.1/§5.2). TOLERANT: it never throws, ignores unknown
// fields and keeps only names and ids. PRIVACY: `tool_input`, prompts, tool responses and the
// assistant text are never read here, so they cannot reach the bus, the state or the logs.
// The payload shape is PROVISIONAL (spike S-03 could not run): see tests/fixtures/hooks/PROVISIONAL.md.

const KIND_BY_HOOK_EVENT: Readonly<Record<string, OfficeEventKind>> = {
  SessionStart: 'session.start',
  SessionEnd: 'session.end',
  UserPromptSubmit: 'prompt.submit',
  Stop: 'turn.stop',
  PreToolUse: 'tool.pre',
  PostToolUse: 'tool.post',
  PostToolUseFailure: 'tool.fail',
  SubagentStart: 'subagent.start',
  SubagentStop: 'subagent.stop',
  PermissionRequest: 'permission.request',
  Notification: 'notification',
  TaskCreated: 'task.created',
  TaskCompleted: 'task.completed',
};

export interface NormalizeOptions {
  devRoot: string;
  makeEvent: EventFactory;
  now: number;
  project?: CwdProjectOptions;
}

export type NormalizeResult =
  { ok: true; event: OfficeEvent } | { ok: false; reason: 'unsupported-event' };

const AGENT_TYPE_RE = /^[A-Za-z0-9][A-Za-z0-9._:@/ -]{0,99}$/;
export const UNKNOWN_AGENT_TYPE = 'unknown';

function cleanAgentType(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return AGENT_TYPE_RE.test(trimmed) ? trimmed : null;
}

function shortId(value: unknown, max = 100): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed !== '' && trimmed.length <= max ? trimmed : undefined;
}

/** `task` is still an unknown shape [?]: read only a few short text fields. */
function taskOf(raw: unknown): { ref?: string; subject?: string } | undefined {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const subject = safeSubject(o.subject ?? o.title ?? o.content);
  const id = typeof o.id === 'string' && /^T-\d{1,3}[a-z]?$/.test(o.id) ? o.id : undefined;
  const ref = id ?? extractTaskRef(subject);
  if (subject === undefined && ref === undefined) return undefined;
  const task: { ref?: string; subject?: string } = {};
  if (ref !== undefined) task.ref = ref;
  if (subject !== undefined) task.subject = subject;
  return task;
}

export function normalizeHookPayload(
  payload: HookPayload,
  options: NormalizeOptions,
): NormalizeResult {
  const kind = KIND_BY_HOOK_EVENT[payload.hook_event_name];
  if (kind === undefined) return { ok: false, reason: 'unsupported-event' };

  const agentId = cleanAgentId(payload.agent_id);
  let agentType = cleanAgentType(payload.agent_type);
  // A subagent event without a usable type is a freelancer ("unknown"); the main thread
  // (no agent_id) without a type is the lead (agentType null).
  if (agentId !== null && agentType === null) agentType = UNKNOWN_AGENT_TYPE;

  const sessionId = shortId(payload.session_id) ?? null;
  const toolName = shortId(payload.tool_name, 200);

  const event = options.makeEvent({
    source: 'hook',
    kind,
    ts: options.now,
    sessionId,
    project: cwdToProject(payload.cwd, options.devRoot, options.project),
    agentType,
    agentId,
    ...(toolName !== undefined &&
    (kind === 'tool.pre' ||
      kind === 'tool.post' ||
      kind === 'tool.fail' ||
      kind === 'permission.request')
      ? {
          tool: {
            name: toolName,
            category: categorizeTool(toolName),
            ...(shortId(payload.tool_use_id) !== undefined
              ? { useId: shortId(payload.tool_use_id) as string }
              : {}),
          },
        }
      : {}),
    ...(kind === 'notification' && shortId(payload.notification_type) !== undefined
      ? { notificationType: shortId(payload.notification_type) as string }
      : {}),
    ...((kind === 'task.created' || kind === 'task.completed') && taskOf(payload.task)
      ? { task: taskOf(payload.task) as { ref?: string; subject?: string } }
      : {}),
  });
  return { ok: true, event };
}
