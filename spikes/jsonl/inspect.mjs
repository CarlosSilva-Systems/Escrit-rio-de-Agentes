// S-05 spike: structure-only inspector for Claude Code JSONL transcripts.
// PRIVACY: prints key names, JS types, counts and numeric usage only. It never prints string
// values (prompts, replies, paths, tool inputs). The only strings printed are a closed set:
// `type`, `message.role`, `stop_reason`, content block `type`, and the shape prefix of ids.
// Usage: node spikes/jsonl/inspect.mjs <file.jsonl> [<subagent-dir>]
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const file = process.argv[2];
const subDir = process.argv[3];
if (!file) {
  console.error('usage: node inspect.mjs <file.jsonl> [<subagents dir>]');
  process.exit(2);
}

const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);
const idShape = (v) => (typeof v === 'string' ? `${v.split('_')[0].slice(0, 6)}…(len ${v.length})` : typeOf(v));
const inc = (map, key, by = 1) => map.set(key, (map.get(key) ?? 0) + by);

const lines = readFileSync(file, 'utf8').split('\n');
let blank = 0;
let bad = 0;
const topKeys = new Map();
const types = new Map();
const roles = new Map();
const blockTypes = new Map();
const usageKeys = new Map();
const stopReasons = new Map();
const idShapes = new Map();
const byMsgId = new Map(); // message.id -> {lines, usages[]}
const byReqId = new Map();
let assistantLines = 0;
let withUsage = 0;
let withoutMsgId = 0;
let withoutReqId = 0;
let withCwd = 0;
let cwdTypes = new Map();
let sidechain = new Map();
let agentIdLines = 0;

for (const raw of lines) {
  if (!raw.trim()) {
    blank++;
    continue;
  }
  let o;
  try {
    o = JSON.parse(raw);
  } catch {
    bad++;
    continue;
  }
  if (o === null || typeof o !== 'object') {
    bad++;
    continue;
  }
  for (const [k, v] of Object.entries(o)) inc(topKeys, `${k}:${typeOf(v)}`);
  inc(types, String(o.type));
  if ('cwd' in o) {
    withCwd++;
    inc(cwdTypes, typeOf(o.cwd));
  }
  if ('isSidechain' in o) inc(sidechain, String(o.isSidechain));
  if ('agentId' in o) agentIdLines++;
  const m = o.message;
  if (m && typeof m === 'object') {
    if (typeof m.role === 'string') inc(roles, m.role);
    if (Array.isArray(m.content)) for (const b of m.content) inc(blockTypes, `${m.role}/${b?.type}`);
    if (o.type === 'assistant') {
      assistantLines++;
      inc(idShapes, `message.id=${idShape(m.id)}`);
      inc(idShapes, `requestId=${idShape(o.requestId)}`);
      if (m.stop_reason !== undefined) inc(stopReasons, String(m.stop_reason));
      if (m.id === undefined) withoutMsgId++;
      if (o.requestId === undefined) withoutReqId++;
      if (m.usage && typeof m.usage === 'object') {
        withUsage++;
        for (const [k, v] of Object.entries(m.usage)) inc(usageKeys, `${k}:${typeOf(v)}`);
        const u = {
          i: m.usage.input_tokens ?? 0,
          o: m.usage.output_tokens ?? 0,
          cr: m.usage.cache_read_input_tokens ?? 0,
          cc: m.usage.cache_creation_input_tokens ?? 0,
        };
        for (const [map, key] of [
          [byMsgId, m.id],
          [byReqId, o.requestId],
        ]) {
          if (typeof key !== 'string') continue;
          const e = map.get(key) ?? { lines: 0, usages: [] };
          e.lines++;
          e.usages.push(u);
          map.set(key, e);
        }
      }
    }
  }
}

const show = (title, map) => {
  console.log(`\n## ${title}`);
  for (const [k, v] of [...map.entries()].sort()) console.log(`  ${k}: ${v}`);
};

console.log(`lines=${lines.length} blank=${blank} unparsable=${bad}`);
show('top-level keys:type', topKeys);
show('type values', types);
show('message.role', roles);
show('content block types', blockTypes);
show('usage keys', usageKeys);
show('stop_reason', stopReasons);
show('id shapes', idShapes);
show('cwd value types', cwdTypes);
show('isSidechain', sidechain);
console.log(`\nassistantLines=${assistantLines} withUsage=${withUsage} noMessageId=${withoutMsgId} noRequestId=${withoutReqId} linesWithCwd=${withCwd} linesWithAgentId=${agentIdLines}`);

const dupReport = (title, map) => {
  const dup = [...map.values()].filter((e) => e.lines > 1);
  const sum = (sel) => [...map.values()].reduce((a, e) => a + sel(e), 0);
  // naive = every line; first = first line per key; max = per-key max of each counter
  const fields = ['i', 'o', 'cr', 'cc'];
  const naive = Object.fromEntries(fields.map((f) => [f, sum((e) => e.usages.reduce((a, u) => a + u[f], 0))]));
  const first = Object.fromEntries(fields.map((f) => [f, sum((e) => e.usages[0][f])]));
  const last = Object.fromEntries(fields.map((f) => [f, sum((e) => e.usages.at(-1)[f])]));
  const max = Object.fromEntries(fields.map((f) => [f, sum((e) => Math.max(...e.usages.map((u) => u[f])))]));
  const differing = dup.filter((e) => new Set(e.usages.map((u) => JSON.stringify(u))).size > 1).length;
  console.log(`\n## dedupe by ${title}`);
  console.log(`  distinct keys=${map.size} keys seen on >1 line=${dup.length} (of which usage differs between lines=${differing})`);
  console.log('  naive sum    ', JSON.stringify(naive));
  console.log('  first-per-key', JSON.stringify(first));
  console.log('  last-per-key ', JSON.stringify(last));
  console.log('  max-per-key  ', JSON.stringify(max));
};
dupReport('message.id', byMsgId);
dupReport('requestId', byReqId);

if (subDir) {
  console.log('\n## subagents dir (names and key sets only)');
  for (const name of readdirSync(subDir)) {
    if (name.endsWith('.meta.json')) {
      try {
        const meta = JSON.parse(readFileSync(join(subDir, name), 'utf8'));
        const keys = Object.entries(meta).map(([k, v]) => `${k}:${typeOf(v)}`);
        const agentType = typeof meta.agentType === 'string' && /^[a-z0-9-]{1,40}$/.test(meta.agentType) ? meta.agentType : '(n/a)';
        console.log(`  ${name.replace(/agent-(.{4}).*\.meta\.json/, 'agent-$1….meta.json')} keys=[${keys.join(', ')}] agentType=${agentType}`);
      } catch {
        console.log(`  ${name}: unparsable meta`);
      }
    } else {
      console.log(`  ${name.replace(/agent-(.{4}).*\.jsonl/, 'agent-$1….jsonl')}`);
    }
  }
}
