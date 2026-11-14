// S-05: generates the SYNTHETIC JSONL fixtures in tests/fixtures/jsonl (known totals).
// Nothing here comes from a real conversation. The "CANARY" strings stand for private text:
// tests assert they never reach any parser output, aggregate or cache.
// Run: node spikes/jsonl/gen-fixtures.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..', '..', 'tests', 'fixtures', 'jsonl');
const SESSION = '11111111-1111-4111-8111-111111111111';
const slugDir = join(root, 'projects', 'D--fake-7---DEV-demo-project');
const subDir = join(slugDir, SESSION, 'subagents');
mkdirSync(subDir, { recursive: true });

const CWD = 'D:\\fake\\7 - DEV\\demo-project';
let n = 0;
const ts = () => new Date(Date.UTC(2026, 0, 1, 0, 0, n++)).toISOString();
const usage = (i, o, cr, cc) => ({
  input_tokens: i,
  output_tokens: o,
  cache_read_input_tokens: cr,
  cache_creation_input_tokens: cc,
  service_tier: 'standard',
});
const assistant = ({ msgId, reqId, block, u, agentId, uuid }) => {
  const message = { role: 'assistant', model: 'synthetic-model', content: [block], stop_reason: null, usage: u };
  if (msgId) message.id = msgId;
  const o = { type: 'assistant', uuid, sessionId: SESSION, cwd: CWD, timestamp: ts(), message };
  if (reqId) o.requestId = reqId;
  if (agentId) {
    o.agentId = agentId;
    o.isSidechain = true;
  }
  return JSON.stringify(o);
};
const text = { type: 'text', text: 'CANARY-ASSISTANT-TEXT' };
const thinking = { type: 'thinking', thinking: 'CANARY-THINKING' };
const toolUse = (id, name) => ({ type: 'tool_use', id, name, input: { file_path: 'CANARY-PATH', secret: 'CANARY-INPUT' } });

// ---- main session: totals input 42 / output 390 / cacheRead 3570 / cacheCreation 82 ----------
const main = [
  JSON.stringify({ type: 'queue-operation', operation: 'enqueue', sessionId: SESSION, timestamp: ts() }),
  JSON.stringify({ type: 'user', uuid: 'u1', sessionId: SESSION, cwd: CWD, timestamp: ts(), message: { role: 'user', content: 'CANARY-USER-PROMPT' } }),
  // msg_A: 3 lines (thinking, text, tool_use) with the SAME usage.
  assistant({ msgId: 'msg_A', reqId: 'req_A', uuid: 'a1', block: thinking, u: usage(10, 100, 1000, 50) }),
  assistant({ msgId: 'msg_A', reqId: 'req_A', uuid: 'a2', block: text, u: usage(10, 100, 1000, 50) }),
  assistant({ msgId: 'msg_A', reqId: 'req_A', uuid: 'a3', block: toolUse('toolu_1', 'Read'), u: usage(10, 100, 1000, 50) }),
  JSON.stringify({ type: 'user', uuid: 'u2', sessionId: SESSION, cwd: CWD, timestamp: ts(), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'CANARY-TOOL-OUTPUT' }] } }),
  // msg_B: 2 lines.
  assistant({ msgId: 'msg_B', reqId: 'req_B', uuid: 'b1', block: text, u: usage(20, 200, 2000, 0) }),
  assistant({ msgId: 'msg_B', reqId: 'req_B', uuid: 'b2', block: toolUse('toolu_2', 'Bash'), u: usage(20, 200, 2000, 0) }),
  '{"type":"assistant","message":{"id":"msg_X","content":[{"type":"text","text":"CANARY-TRUNCATED',
  // msg_C: no message.id, only requestId, single line.
  assistant({ reqId: 'req_C', uuid: 'c1', block: text, u: usage(5, 50, 500, 25) }),
  // msg_D: streamed partial usage (output grows 10 -> 40): keep the max.
  assistant({ msgId: 'msg_D', reqId: 'req_D', uuid: 'd1', block: thinking, u: usage(7, 10, 70, 7) }),
  assistant({ msgId: 'msg_D', reqId: 'req_D', uuid: 'd2', block: text, u: usage(7, 40, 70, 7) }),
  '[1,2,3]',
  JSON.stringify({ type: 'system', subtype: 'future-kind', sessionId: SESSION, timestamp: ts() }),
  // msg_E: garbled counters (strings/negative) count as zero.
  assistant({ msgId: 'msg_E', reqId: 'req_E', uuid: 'e1', block: text, u: { input_tokens: 'oops', output_tokens: -5 } }),
  '',
];
writeFileSync(join(slugDir, `${SESSION}.jsonl`), main.join('\n'));

// ---- subagents -------------------------------------------------------------------------------
const sub = (agentId, msgs) =>
  msgs.flatMap(([msgId, count, u]) =>
    Array.from({ length: count }, (_, i) =>
      assistant({ msgId, reqId: `req_${msgId}`, uuid: `${msgId}-${i}`, block: i % 2 ? toolUse(`t_${msgId}`, 'Edit') : text, u, agentId }),
    ),
  );
const writeSub = (agentId, msgs, meta) => {
  writeFileSync(join(subDir, `agent-${agentId}.jsonl`), sub(agentId, msgs).join('\n') + '\n');
  if (meta) writeFileSync(join(subDir, `agent-${agentId}.meta.json`), JSON.stringify(meta, null, 2) + '\n');
};
// dev-web: 7 / 70 / 700 / 7
writeSub('adev0001', [['msg_S1', 2, usage(3, 30, 300, 3)], ['msg_S2', 1, usage(4, 40, 400, 4)]], {
  agentType: 'dev-web',
  isBuiltIn: false,
  description: 'CANARY-DESCRIPTION',
  toolUseId: 'toolu_syn1',
  spawnDepth: 1,
  finished: true,
});
// unknown type: 1 / 10 / 100 / 1
writeSub('agp00002', [['msg_G1', 2, usage(1, 10, 100, 1)]], {
  agentType: 'general-purpose',
  isBuiltIn: true,
  description: 'CANARY-DESCRIPTION',
  toolUseId: 'toolu_syn2',
  spawnDepth: 1,
});
// no meta file at all: 2 / 20 / 200 / 2
writeSub('anometa3', [['msg_N1', 1, usage(2, 20, 200, 2)], ], null);
writeFileSync(join(subDir, 'agent-anometa3.prefix.json'), '{}\n');

const expected = {
  note: 'Known totals of the synthetic fixtures (generated by spikes/jsonl/gen-fixtures.mjs).',
  devRoot: 'D:\\fake\\7 - DEV',
  main: {
    file: `projects/D--fake-7---DEV-demo-project/${SESSION}.jsonl`,
    dedupedUsage: { input: 42, output: 390, cacheRead: 3570, cacheCreation: 82 },
    naiveUsage: { input: 89, output: 800, cacheRead: 7640, cacheCreation: 189 },
    ignoredLines: 2,
    usageLines: 9,
    duplicateLines: 4,
    cwdProject: { kind: 'dev', name: 'demo-project' },
  },
  subagents: {
    'agent-adev0001': { agentType: 'dev-web', finished: true, usage: { input: 7, output: 70, cacheRead: 700, cacheCreation: 7 } },
    'agent-agp00002': { agentType: 'general-purpose', usage: { input: 1, output: 10, cacheRead: 100, cacheCreation: 1 } },
    'agent-anometa3': { agentType: null, usage: { input: 2, output: 20, cacheRead: 200, cacheCreation: 2 } },
  },
  grandTotal: { input: 52, output: 490, cacheRead: 4570, cacheCreation: 92 },
  canaries: ['CANARY-USER-PROMPT', 'CANARY-ASSISTANT-TEXT', 'CANARY-THINKING', 'CANARY-PATH', 'CANARY-INPUT', 'CANARY-TOOL-OUTPUT', 'CANARY-TRUNCATED', 'CANARY-DESCRIPTION'],
};
writeFileSync(join(root, 'expected.json'), JSON.stringify(expected, null, 2) + '\n');
console.log('fixtures written to', root);
