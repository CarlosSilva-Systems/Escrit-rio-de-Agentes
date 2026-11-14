// Tolerant parser of ONE Claude Code JSONL transcript line (ADR-0006, CA-63/CA-64).
// Never throws. PRIVACY: it extracts only ids, counters, tool NAMES, model and stop reason.
// Prompt/response text, tool inputs/outputs and file contents are never copied out of the line.

export const MAX_LINE_CHARS = 4 * 1024 * 1024;

export interface UsageCounters {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
}

export const ZERO_USAGE: Readonly<UsageCounters> = Object.freeze({
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheCreation: 0,
});

export interface AssistantInfo {
  /** `message.id` (msg_…). */
  messageId?: string;
  /** Top-level `requestId` (req_…). */
  requestId?: string;
  model?: string;
  stopReason?: string;
  usage?: UsageCounters;
  /** Names only (never inputs) of `tool_use` content blocks. */
  toolUses: { name: string; id?: string }[];
}

export interface JsonlRecord {
  /** Top-level `type` ("assistant", "user", "system", …) or null when absent. */
  type: string | null;
  uuid?: string;
  sessionId?: string;
  /** Present in subagent files (`agent-<id>`). */
  agentId?: string;
  cwd?: string;
  isSidechain?: boolean;
  /** Epoch ms parsed from `timestamp` (ISO string). */
  timestamp?: number;
  assistant?: AssistantInfo;
}

export type IgnoreReason = 'invalid-json' | 'not-object' | 'too-long';

export type ParseLineResult =
  | { kind: 'record'; record: JsonlRecord }
  | { kind: 'empty' }
  | { kind: 'ignored'; reason: IgnoreReason };

const isObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

const str = (v: unknown, max = 200): string | undefined =>
  typeof v === 'string' && v.length > 0 ? v.slice(0, max) : undefined;

/** Non-negative finite integer or 0 (counters can be missing/garbled in other versions). */
function counter(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

export function extractUsage(usage: unknown): UsageCounters | undefined {
  if (!isObject(usage)) return undefined;
  return {
    input: counter(usage.input_tokens),
    output: counter(usage.output_tokens),
    cacheRead: counter(usage.cache_read_input_tokens),
    cacheCreation: counter(usage.cache_creation_input_tokens),
  };
}

function extractAssistant(o: Record<string, unknown>): AssistantInfo | undefined {
  const message = o.message;
  if (!isObject(message)) return undefined;
  const info: AssistantInfo = { toolUses: [] };
  const messageId = str(message.id, 100);
  const requestId = str(o.requestId, 100);
  const model = str(message.model, 100);
  const stopReason = str(message.stop_reason, 40);
  const usage = extractUsage(message.usage);
  if (messageId) info.messageId = messageId;
  if (requestId) info.requestId = requestId;
  if (model) info.model = model;
  if (stopReason) info.stopReason = stopReason;
  if (usage) info.usage = usage;
  if (Array.isArray(message.content)) {
    for (const block of message.content) {
      if (isObject(block) && block.type === 'tool_use') {
        const name = str(block.name, 100);
        if (name) {
          const id = str(block.id, 100);
          info.toolUses.push(id ? { name, id } : { name });
        }
      }
      if (info.toolUses.length >= 50) break;
    }
  }
  return info;
}

/** Parses one line (without the trailing newline). */
export function parseJsonlLine(line: string): ParseLineResult {
  if (line.length > MAX_LINE_CHARS) return { kind: 'ignored', reason: 'too-long' };
  const trimmed = line.trim();
  if (trimmed === '') return { kind: 'empty' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { kind: 'ignored', reason: 'invalid-json' };
  }
  if (!isObject(parsed)) return { kind: 'ignored', reason: 'not-object' };

  const record: JsonlRecord = {
    type: typeof parsed.type === 'string' ? parsed.type.slice(0, 64) : null,
  };
  const uuid = str(parsed.uuid, 100);
  const sessionId = str(parsed.sessionId, 100);
  const agentId = str(parsed.agentId, 100);
  const cwd = str(parsed.cwd, 1000);
  if (uuid) record.uuid = uuid;
  if (sessionId) record.sessionId = sessionId;
  if (agentId) record.agentId = agentId;
  if (cwd) record.cwd = cwd;
  if (typeof parsed.isSidechain === 'boolean') record.isSidechain = parsed.isSidechain;
  if (typeof parsed.timestamp === 'string') {
    const ms = Date.parse(parsed.timestamp);
    if (Number.isFinite(ms)) record.timestamp = ms;
  }
  if (record.type === 'assistant') {
    const assistant = extractAssistant(parsed);
    if (assistant) {
      // The dedupe key falls back to the line uuid when neither id is present.
      record.assistant = assistant;
    }
  }
  return { kind: 'record', record };
}
