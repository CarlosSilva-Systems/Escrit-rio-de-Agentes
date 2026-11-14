import { describe, expect, it } from 'vitest';
import { JsonlIngestor } from './ingest';
import { MAX_LINE_CHARS, parseJsonlLine } from './parseLine';
import type { JsonlRecord } from './parseLine';
import { cwdToProject } from './project';
import { parseSubagentMeta, parseSubagentPath } from './subagent';
import { JsonlTailer } from './tail';
import type { TailFs } from './tail';
import { sumDedupedUsage, UsageDeduper } from './usage';

const enc = new TextEncoder();

/** In-memory filesystem for the tailer. */
function memFs() {
  const files = new Map<string, Uint8Array>();
  const fs: TailFs = {
    stat: async (p) => {
      const d = files.get(p);
      return d ? { size: d.length, mtimeMs: 1 } : null;
    },
    readRange: async (p, start, length) =>
      (files.get(p) ?? new Uint8Array()).slice(start, start + length),
  };
  const set = (p: string, text: string) => files.set(p, enc.encode(text));
  const append = (p: string, text: string) => {
    const old = files.get(p) ?? new Uint8Array();
    const add = enc.encode(text);
    const next = new Uint8Array(old.length + add.length);
    next.set(old);
    next.set(add, old.length);
    files.set(p, next);
  };
  return { fs, set, append, remove: (p: string) => files.delete(p) };
}

const assistantLine = (
  id: string | null,
  u: Record<string, unknown>,
  extra: Record<string, unknown> = {},
) =>
  JSON.stringify({
    type: 'assistant',
    uuid: `u-${Math.random()}`,
    ...(id ? { requestId: `req_${id}` } : {}),
    message: {
      ...(id ? { id } : {}),
      role: 'assistant',
      content: [{ type: 'text', text: 'SECRET-TEXT' }],
      usage: u,
    },
    ...extra,
  });
const u = (i: number, o: number, cr = 0, cc = 0) => ({
  input_tokens: i,
  output_tokens: o,
  cache_read_input_tokens: cr,
  cache_creation_input_tokens: cc,
});

describe('parseJsonlLine (CA-63: tolerant)', () => {
  it('CA-63: never throws on garbage and classifies the ignored reason', () => {
    expect(parseJsonlLine('{"type":"assistant"')).toEqual({
      kind: 'ignored',
      reason: 'invalid-json',
    });
    expect(parseJsonlLine('[1,2]')).toEqual({ kind: 'ignored', reason: 'not-object' });
    expect(parseJsonlLine('"text"')).toEqual({ kind: 'ignored', reason: 'not-object' });
    expect(parseJsonlLine('   ')).toEqual({ kind: 'empty' });
    expect(parseJsonlLine('x'.repeat(MAX_LINE_CHARS + 1))).toEqual({
      kind: 'ignored',
      reason: 'too-long',
    });
    for (const junk of [
      '\u0000',
      'null',
      '{"type":5,"message":7,"usage":[]}',
      '{"message":{"usage":{"input_tokens":{}}}}',
    ]) {
      expect(() => parseJsonlLine(junk)).not.toThrow();
    }
  });

  it('CA-64: extracts ids, counters and tool NAMES only; text and tool inputs are dropped', () => {
    const line = JSON.stringify({
      type: 'assistant',
      uuid: 'u1',
      sessionId: 's1',
      cwd: 'D:\\x\\7 - DEV\\p',
      timestamp: '2026-01-01T00:00:00.000Z',
      requestId: 'req_1',
      message: {
        id: 'msg_1',
        model: 'm',
        stop_reason: 'tool_use',
        content: [
          { type: 'text', text: 'SECRET-TEXT' },
          { type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'SECRET-CMD' } },
        ],
        usage: u(1, 2, 3, 4),
      },
    });
    const r = parseJsonlLine(line);
    expect(r.kind).toBe('record');
    if (r.kind !== 'record') return;
    expect(r.record.assistant).toEqual({
      messageId: 'msg_1',
      requestId: 'req_1',
      model: 'm',
      stopReason: 'tool_use',
      usage: { input: 1, output: 2, cacheRead: 3, cacheCreation: 4 },
      toolUses: [{ name: 'Bash', id: 't1' }],
    });
    expect(r.record.timestamp).toBe(Date.UTC(2026, 0, 1));
    expect(JSON.stringify(r.record)).not.toMatch(/SECRET/);
  });

  it('CA-63: garbled counters become zero instead of NaN/negative', () => {
    const r = parseJsonlLine(
      assistantLine('msg_1', {
        input_tokens: 'x',
        output_tokens: -3,
        cache_read_input_tokens: 1.9,
      }),
    );
    expect(r.kind === 'record' && r.record.assistant?.usage).toEqual({
      input: 0,
      output: 0,
      cacheRead: 1,
      cacheCreation: 0,
    });
  });
});

describe('usage dedupe (S-05, CA-63)', () => {
  const rec = (line: string): JsonlRecord => {
    const r = parseJsonlLine(line);
    if (r.kind !== 'record') throw new Error('fixture line must parse');
    return r.record;
  };

  it('CA-63: lines of one message.id count once (totals are exact, not 3x)', () => {
    const lines = [
      assistantLine('msg_A', u(10, 100, 1000, 50)),
      assistantLine('msg_A', u(10, 100, 1000, 50)),
      assistantLine('msg_A', u(10, 100, 1000, 50)),
      assistantLine('msg_B', u(1, 2, 3, 4)),
    ];
    expect(sumDedupedUsage(lines.map(rec))).toEqual({
      input: 11,
      output: 102,
      cacheRead: 1003,
      cacheCreation: 54,
    });
  });

  it('CA-63: a streamed partial (output 10 then 40) ends as the maximum, as an increment', () => {
    const d = new UsageDeduper();
    expect(d.add(rec(assistantLine('msg_D', u(7, 10, 70, 7))))).toEqual({
      input: 7,
      output: 10,
      cacheRead: 70,
      cacheCreation: 7,
    });
    expect(d.add(rec(assistantLine('msg_D', u(7, 40, 70, 7))))).toEqual({
      input: 0,
      output: 30,
      cacheRead: 0,
      cacheCreation: 0,
    });
    // A later smaller repeat never decreases the total.
    expect(d.add(rec(assistantLine('msg_D', u(7, 5, 70, 7))))).toEqual({
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheCreation: 0,
    });
  });

  it('CA-63: key falls back to requestId, then uuid; no key at all counts once per line', () => {
    const byReq = assistantLine(null, u(5, 5), { requestId: 'req_only' });
    expect(sumDedupedUsage([rec(byReq), rec(byReq)])).toEqual({
      input: 5,
      output: 5,
      cacheRead: 0,
      cacheCreation: 0,
    });
    const byUuid = JSON.stringify({ type: 'assistant', uuid: 'same', message: { usage: u(2, 2) } });
    expect(sumDedupedUsage([rec(byUuid), rec(byUuid)])).toEqual({
      input: 2,
      output: 2,
      cacheRead: 0,
      cacheCreation: 0,
    });
    const nokey = JSON.stringify({ type: 'assistant', message: { usage: u(2, 2) } });
    const d = new UsageDeduper();
    d.add(rec(nokey));
    d.add(rec(nokey));
    expect(d.stats).toEqual({ usageLines: 2, duplicateLines: 0, withoutKey: 2 });
  });

  it('CA-63: the key map is bounded (oldest keys are evicted)', () => {
    const d = new UsageDeduper(3);
    for (let i = 0; i < 10; i++) d.add(rec(assistantLine(`msg_${i}`, u(1, 1))));
    // msg_0 was evicted, so it would count again; recent keys are still deduped.
    expect(d.add(rec(assistantLine('msg_9', u(1, 1))))).toEqual({
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheCreation: 0,
    });
  });
});

describe('subagent files (CA-18)', () => {
  it('CA-18: recognizes transcript, meta and prefix files with session and project', () => {
    const base = 'C--proj-slug/sess-1/subagents/';
    expect(parseSubagentPath(`${base}agent-a0779dbad76c4a74c.jsonl`)).toEqual({
      kind: 'transcript',
      agentId: 'a0779dbad76c4a74c',
      sessionId: 'sess-1',
      projectSlug: 'C--proj-slug',
    });
    expect(parseSubagentPath(`${base}agent-abc.meta.json`)?.kind).toBe('meta');
    expect(parseSubagentPath(`${base}agent-abc.prefix.json`)?.kind).toBe('prefix');
    expect(
      parseSubagentPath('C:\\Users\\x\\.claude\\projects\\slug\\sess\\subagents\\agent-z9.jsonl'),
    ).toMatchObject({ agentId: 'z9', sessionId: 'sess', projectSlug: 'slug' });
    for (const bad of [
      'sess/agent-a.jsonl',
      'sess/subagents/other.jsonl',
      'sess/subagents/agent-.jsonl',
      'subagents/agent-a.jsonl',
      'a/b/subagents/agent-a.txt',
      '',
    ]) {
      expect(parseSubagentPath(bad)).toBeNull();
    }
  });

  it('CA-18: meta gives agentType and finished, never the task description', () => {
    const meta = parseSubagentMeta(
      JSON.stringify({
        agentType: 'dev-web',
        finished: true,
        description: 'SECRET-DESC',
        toolUseId: 'toolu_1',
        isBuiltIn: false,
      }),
    );
    expect(meta).toEqual({
      agentType: 'dev-web',
      finished: true,
      isBuiltIn: false,
      toolUseId: 'toolu_1',
    });
    expect(JSON.stringify(meta)).not.toMatch(/SECRET/);
  });

  it('CA-18: broken or hostile meta gives an empty result (the agent becomes a Freelancer)', () => {
    expect(parseSubagentMeta('{broken')).toEqual({});
    expect(parseSubagentMeta('[]')).toEqual({});
    expect(parseSubagentMeta('{"agentType":"../../etc","finished":"yes"}')).toEqual({});
    expect(parseSubagentMeta('{"agentType":"plugin:agent-x"}')).toEqual({
      agentType: 'plugin:agent-x',
    });
  });
});

describe('cwd -> project (CA-44)', () => {
  const root = 'D:\\fake\\7 - DEV';

  it('CA-44: first level under the DEV root is the project, deeper folders and case do not matter', () => {
    expect(cwdToProject('D:\\fake\\7 - DEV\\Sites', root)).toEqual({ kind: 'dev', name: 'Sites' });
    expect(cwdToProject('D:\\fake\\7 - DEV\\Sites\\src\\app\\', root)).toEqual({
      kind: 'dev',
      name: 'Sites',
    });
    expect(cwdToProject('d:/FAKE/7 - dev/Sites', root)).toEqual({ kind: 'dev', name: 'Sites' });
    expect(cwdToProject('\\\\?\\D:\\fake\\7 - DEV\\Sites', root)).toEqual({
      kind: 'dev',
      name: 'Sites',
    });
  });

  it('CA-44: the catalog can canonicalize the folder name casing', () => {
    const canonicalName = (n: string) => (n.toLowerCase() === 'sites' ? 'Sites' : undefined);
    expect(cwdToProject('d:\\fake\\7 - dev\\SITES\\x', root, { canonicalName })).toEqual({
      kind: 'dev',
      name: 'Sites',
    });
  });

  it('CA-44: outside folders expose only the folder name, never the full path', () => {
    const r = cwdToProject('C:\\Users\\someone\\Documents\\other-proj', root);
    expect(r).toEqual({ kind: 'outside', basename: 'other-proj' });
    expect(JSON.stringify(r)).not.toMatch(/someone/);
  });

  it('CA-44: sibling prefix, dot-dot escape, UNC, 8.3 and reserved names are not projects', () => {
    expect(cwdToProject('D:\\fake\\7 - DEV-old\\x', root)).toEqual({
      kind: 'outside',
      basename: 'x',
    });
    expect(cwdToProject('D:\\fake\\7 - DEV\\..\\escape', root)).toEqual({
      kind: 'outside',
      basename: 'escape',
    });
    expect(cwdToProject('\\\\srv\\share\\7 - DEV\\p', root)).toMatchObject({ kind: 'outside' });
    expect(cwdToProject('D:\\fake\\7 - DEV\\PROGRA~1', root)).toEqual({
      kind: 'outside',
      basename: 'PROGRA~1',
    });
    expect(cwdToProject('D:\\fake\\7 - DEV\\CON', root)).toEqual({
      kind: 'outside',
      basename: 'CON',
    });
  });

  it('CA-44: missing cwd or the DEV root itself is unknown', () => {
    for (const v of [undefined, null, '', '  ', root, 'D:\\'])
      expect(cwdToProject(v, root)).toEqual({ kind: 'unknown' });
  });
});

describe('JsonlTailer (CA-63: incremental)', () => {
  const P = 'f.jsonl';

  it('CA-63: reads from the offset, only complete lines, and never re-reads old data', async () => {
    const m = memFs();
    const tailer = new JsonlTailer(m.fs);
    m.set(P, 'a\nb\npar');
    expect((await tailer.poll(P)).lines).toEqual(['a', 'b']);
    expect(tailer.snapshot()[P]?.offset).toBe(4);
    expect((await tailer.poll(P)).lines).toEqual([]); // partial line still incomplete
    m.append(P, 'tial\r\nc\n');
    expect((await tailer.poll(P)).lines).toEqual(['partial', 'c']);
    m.append(P, 'd\n');
    expect((await tailer.poll(P)).lines).toEqual(['d']);
  });

  it('CA-63: truncation resets the offset and the file is re-read from the start', async () => {
    const m = memFs();
    const tailer = new JsonlTailer(m.fs);
    m.set(P, 'one\ntwo\nthree\n');
    await tailer.poll(P);
    m.set(P, 'new\n');
    const r = await tailer.poll(P);
    expect(r.truncated).toBe(true);
    expect(r.lines).toEqual(['new']);
  });

  it('CA-63: a replaced file that is not shorter is detected by its first bytes', async () => {
    const m = memFs();
    const tailer = new JsonlTailer(m.fs);
    m.set(P, 'aaaa\nbbbb\n');
    await tailer.poll(P);
    m.set(P, 'XXXX\nYYYY\nZZZZ\n'); // rotated: larger than before
    const r = await tailer.poll(P);
    expect(r.truncated).toBe(true);
    expect(r.lines).toEqual(['XXXX', 'YYYY', 'ZZZZ']);
  });

  it('CA-63: a deleted file is reported gone and forgotten; a new one starts from 0', async () => {
    const m = memFs();
    const tailer = new JsonlTailer(m.fs);
    m.set(P, 'a\n');
    await tailer.poll(P);
    m.remove(P);
    expect((await tailer.poll(P)).gone).toBe(true);
    expect(tailer.has(P)).toBe(false);
    m.set(P, 'b\n');
    expect((await tailer.poll(P)).lines).toEqual(['b']);
  });

  it('CA-63: attachAtEnd skips history and delivers only later appends', async () => {
    const m = memFs();
    const tailer = new JsonlTailer(m.fs);
    m.set(P, 'old1\nold2\n');
    expect(await tailer.attachAtEnd(P)).toBe(true);
    expect((await tailer.poll(P)).lines).toEqual([]);
    m.append(P, 'new\n');
    expect((await tailer.poll(P)).lines).toEqual(['new']);
  });

  it('CA-63: restored offsets continue where the cache left off', async () => {
    const m = memFs();
    m.set(P, 'a\nb\nc\n');
    const first = new JsonlTailer(m.fs);
    await first.poll(P);
    const saved = first.snapshot()[P]!;
    m.append(P, 'd\n');
    const second = new JsonlTailer(m.fs);
    second.restore(P, saved);
    expect((await second.poll(P)).lines).toEqual(['d']);
  });

  it('CA-63: multi-byte UTF-8 split across chunks is decoded correctly', async () => {
    const m = memFs();
    const tailer = new JsonlTailer(m.fs, { chunkBytes: 5 });
    m.set(P, 'ação-ç\nôô\n');
    expect((await tailer.poll(P)).lines).toEqual(['ação-ç', 'ôô']);
  });

  it('CA-63: the per-poll cap reports more data and resumes without losing lines', async () => {
    const m = memFs();
    const tailer = new JsonlTailer(m.fs, { chunkBytes: 8, maxBytesPerPoll: 8 });
    m.set(P, '1111111\n2222222\n3333333\n');
    const got: string[] = [];
    for (let i = 0; i < 10; i++) {
      const r = await tailer.poll(P);
      got.push(...r.lines);
      if (!r.more) break;
    }
    expect(got).toEqual(['1111111', '2222222', '3333333']);
  });

  it('CA-63: a line longer than the window is still read; a line over the limit is skipped and counted', async () => {
    const m = memFs();
    const tailer = new JsonlTailer(m.fs, { chunkBytes: 8, maxLineBytes: 64 });
    m.set(P, `${'x'.repeat(40)}\nok\n`);
    expect((await tailer.poll(P)).lines).toEqual(['x'.repeat(40), 'ok']);
    m.append(P, `${'y'.repeat(200)}\nafter\n`);
    const r = await tailer.poll(P);
    expect(r.oversizedLines).toBeGreaterThan(0);
    expect(r.lines.at(-1)).toBe('after');
  });

  it('concurrent polls of the same file are serialized (no duplicated lines)', async () => {
    const m = memFs();
    const tailer = new JsonlTailer(m.fs);
    m.set(P, 'a\nb\n');
    const all = await Promise.all([tailer.poll(P), tailer.poll(P), tailer.poll(P)]);
    expect(all.flatMap((r) => r.lines)).toEqual(['a', 'b']);
  });
});

describe('JsonlIngestor', () => {
  it('CA-63: counts ignored lines, dedupes across polls and resets after truncation', async () => {
    const m = memFs();
    const ing = new JsonlIngestor(new JsonlTailer(m.fs));
    m.set(
      'f',
      `${assistantLine('msg_A', u(10, 100))}\n{broken\n${assistantLine('msg_A', u(10, 100))}\n`,
    );
    const r1 = await ing.poll('f');
    expect(r1.ignoredLines).toBe(1);
    expect(r1.ignoredByReason).toEqual({ 'invalid-json': 1 });
    expect(r1.records.map((x) => x.usageDelta?.input ?? null)).toEqual([10, null]);

    m.append('f', `${assistantLine('msg_A', u(10, 100))}\n`); // streamed repeat in a later poll
    const r2 = await ing.poll('f');
    expect(r2.records[0]?.usageDelta).toBeNull();

    m.set('f', `${assistantLine('msg_A', u(10, 100))}\n`); // truncated + rewritten: counts again
    const r3 = await ing.poll('f');
    expect(r3.truncated).toBe(true);
    expect(r3.records[0]?.usageDelta?.input).toBe(10);
  });
});
