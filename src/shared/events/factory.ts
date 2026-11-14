import {
  PROTOCOL_VERSION,
  type OfficeEvent,
  type ProjectRef,
  type ToolCategory,
} from '../contracts';

// Builds normalized `OfficeEvent`s (ARQUITETURA §5.2). Pure: clock and randomness are injected.

export interface EventInit {
  source: OfficeEvent['source'];
  kind: OfficeEvent['kind'];
  ts?: number;
  sessionId?: string | null;
  project?: ProjectRef;
  /** `null` (default) = main thread. */
  agentType?: string | null;
  agentId?: string | null;
  tool?: { name: string; category: ToolCategory; useId?: string };
  notificationType?: string;
  task?: { ref?: string; subject?: string };
}

export type EventFactory = (init: EventInit) => OfficeEvent;

export interface EventFactoryOptions {
  now?: () => number;
  /** Short random suffix (default: Math.random based). */
  random?: () => string;
}

const defaultRandom = () => Math.random().toString(36).slice(2, 6).padEnd(4, '0');

export function createEventFactory(options: EventFactoryOptions = {}): EventFactory {
  const now = options.now ?? (() => Date.now());
  const random = options.random ?? defaultRandom;
  let seq = 0;
  return (init) => {
    const ts = init.ts ?? now();
    seq = (seq + 1) % 46656; // 36^3
    const id = `${ts.toString(36)}${seq.toString(36).padStart(3, '0')}${random()}`.slice(0, 64);
    const event: OfficeEvent = {
      v: PROTOCOL_VERSION,
      id,
      ts,
      source: init.source,
      kind: init.kind,
      sessionId: init.sessionId ?? null,
      project: init.project ?? { kind: 'unknown' },
      agent: { agentType: init.agentType ?? null, agentId: init.agentId ?? null },
    };
    if (init.tool) event.tool = init.tool;
    if (init.notificationType) event.notificationType = init.notificationType;
    if (init.task && (init.task.ref !== undefined || init.task.subject !== undefined)) {
      event.task = init.task;
    }
    return event;
  };
}

/**
 * Subagent ids appear as `agent-<id>` in file names and (possibly) in hook payloads: both
 * sources are normalized to the bare `<id>` so the same agent dedupes across them. [?] S-03
 * confirms the real hook format; stripping is harmless when there is no prefix.
 */
export function cleanAgentId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/^agent-/i, '');
  if (trimmed === '' || trimmed.length > 100) return null;
  return /^[A-Za-z0-9_.:-]+$/.test(trimmed) ? trimmed : null;
}
