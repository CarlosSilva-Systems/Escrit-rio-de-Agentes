import {
  appendFileSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  addUsage,
  cwdToProject,
  JsonlIngestor,
  JsonlTailer,
  nodeTailFs,
  parseSubagentMeta,
  parseSubagentPath,
  ZERO_USAGE,
} from '../../src/server/jsonl';
import type { IngestPoll, UsageCounters } from '../../src/server/jsonl';

const fixtureRoot = join(import.meta.dirname, '..', 'fixtures', 'jsonl');
const expected = JSON.parse(readFileSync(join(fixtureRoot, 'expected.json'), 'utf8'));
const SESSION = '11111111-1111-4111-8111-111111111111';
const slugDir = join(fixtureRoot, 'projects', 'D--fake-7---DEV-demo-project');
const mainFile = join(slugDir, `${SESSION}.jsonl`);
const subDir = join(slugDir, SESSION, 'subagents');

const sum = (poll: IngestPoll): UsageCounters =>
  poll.records.reduce((acc, r) => (r.usageDelta ? addUsage(acc, r.usageDelta) : acc), {
    ...ZERO_USAGE,
  });

describe('JSONL fixtures with known totals (CA-63, CA-64)', () => {
  it('CA-63: the main session totals equal the known deduplicated values, not the naive sum', async () => {
    const ing = new JsonlIngestor(new JsonlTailer(nodeTailFs));
    const poll = await ing.poll(mainFile);
    expect(sum(poll)).toEqual(expected.main.dedupedUsage);
    expect(sum(poll)).not.toEqual(expected.main.naiveUsage);
    expect(poll.ignoredLines).toBe(expected.main.ignoredLines);
    expect(ing.stats(mainFile)).toMatchObject({
      usageLines: expected.main.usageLines,
      duplicateLines: expected.main.duplicateLines,
      withoutKey: 0,
    });
  });

  it('CA-63: reading in two halves (incremental) gives the same exact totals', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'jsonl-inc-'));
    try {
      const target = join(dir, 'session.jsonl');
      const text = readFileSync(mainFile, 'utf8');
      const cut = text.indexOf('\n', Math.floor(text.length / 2)) + 1;
      const ing = new JsonlIngestor(new JsonlTailer(nodeTailFs));
      writeFileSync(target, text.slice(0, cut - 20)); // ends mid-line
      const first = await ing.poll(target);
      appendFileSync(target, text.slice(cut - 20));
      const second = await ing.poll(target);
      expect(addUsage(sum(first), sum(second))).toEqual(expected.main.dedupedUsage);
      expect(first.ignoredLines + second.ignoredLines).toBe(expected.main.ignoredLines);
      expect((await ing.poll(target)).records).toEqual([]); // nothing new: nothing re-read
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('CA-18: each subagent file maps to its agentType via .meta.json and has exact totals', async () => {
    const tailer = new JsonlTailer(nodeTailFs);
    const ing = new JsonlIngestor(tailer);
    let grand = sum(await ing.poll(mainFile));
    const transcripts = readdirSync(subDir).filter(
      (f) => parseSubagentPath(join(subDir, f))?.kind === 'transcript',
    );
    expect(transcripts).toHaveLength(3);
    for (const file of transcripts) {
      const info = parseSubagentPath(join(subDir, file))!;
      const key = `agent-${info.agentId}`;
      expect(info.sessionId).toBe(SESSION);
      const metaPath = join(subDir, `${key}.meta.json`);
      let agentType: string | null;
      let finished: boolean | undefined;
      try {
        const meta = parseSubagentMeta(readFileSync(metaPath, 'utf8'));
        agentType = meta.agentType ?? null;
        finished = meta.finished;
      } catch {
        agentType = null; // no meta file: becomes a Freelancer upstream
      }
      const exp = expected.subagents[key];
      expect(agentType, key).toBe(exp.agentType);
      if (exp.finished !== undefined) expect(finished).toBe(exp.finished);
      const usage = sum(await ing.poll(join(subDir, file)));
      expect(usage, key).toEqual(exp.usage);
      grand = addUsage(grand, usage);
    }
    expect(grand).toEqual(expected.grandTotal);
  });

  it('CA-44: cwd inside the fixtures maps to the project under the fake DEV root', async () => {
    const ing = new JsonlIngestor(new JsonlTailer(nodeTailFs));
    const poll = await ing.poll(mainFile);
    const cwd = poll.records.find((r) => r.record.cwd)?.record.cwd;
    expect(cwdToProject(cwd, expected.devRoot)).toEqual(expected.main.cwdProject);
    expect(cwdToProject(cwd, 'C:\\other\\root')).toMatchObject({
      kind: 'outside',
      basename: 'demo-project',
    });
  });

  it('CA-64: no conversation text, tool input/output or task description reaches any parsed output or offsets', async () => {
    const ing = new JsonlIngestor(new JsonlTailer(nodeTailFs));
    const outputs: unknown[] = [];
    for (const file of [
      mainFile,
      ...readdirSync(subDir)
        .filter((f) => f.endsWith('.jsonl'))
        .map((f) => join(subDir, f)),
    ]) {
      outputs.push(await ing.poll(file));
    }
    for (const f of readdirSync(subDir).filter((x) => x.endsWith('.meta.json'))) {
      outputs.push(parseSubagentMeta(readFileSync(join(subDir, f), 'utf8')));
    }
    outputs.push(ing.tailer.snapshot());
    const serialized = JSON.stringify(outputs);
    for (const canary of expected.canaries as string[])
      expect(serialized, canary).not.toContain(canary);
  });
});

describe('JsonlTailer on real files (CA-63)', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });
  const tmp = () => {
    const d = mkdtempSync(join(tmpdir(), 'jsonl-tail-'));
    dirs.push(d);
    return d;
  };

  it('CA-63: appends are picked up incrementally; truncation re-reads from the start', async () => {
    const file = join(tmp(), 's.jsonl');
    const tailer = new JsonlTailer(nodeTailFs);
    writeFileSync(file, '{"a":1}\n{"a":2}\n');
    expect((await tailer.poll(file)).lines).toEqual(['{"a":1}', '{"a":2}']);
    appendFileSync(file, '{"a":3}\n');
    expect((await tailer.poll(file)).lines).toEqual(['{"a":3}']);
    writeFileSync(file, '{"b":1}\n'); // truncated (shorter) and rewritten
    const r = await tailer.poll(file);
    expect(r.truncated).toBe(true);
    expect(r.lines).toEqual(['{"b":1}']);
  });

  it('CA-63: a file that does not exist yet is reported gone, then read once it appears', async () => {
    const file = join(tmp(), 'later.jsonl');
    const tailer = new JsonlTailer(nodeTailFs);
    expect((await tailer.poll(file)).gone).toBe(true);
    writeFileSync(file, 'x\n');
    expect((await tailer.poll(file)).lines).toEqual(['x']);
  });
});
