import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CLI_CATALOGS, runTeamCli } from './index';
import type { CliIo } from './index';

const fixtures = join(import.meta.dirname, '..', '..', '..', 'tests', 'fixtures');
const read = (...p: string[]) => readFileSync(join(fixtures, ...p), 'utf8');
const proposalText = read('escritorio', 'proposta.valid.json');
const quadroText = read('team', 'QUADRO.sample.md');
const mapText = read('team', 'mapa-index.json');

function memIo(files: Record<string, string>) {
  const out: string[] = [];
  const err: string[] = [];
  const writes = new Map<string, string>();
  const io: CliIo = {
    out: (l) => out.push(l),
    err: (l) => err.push(l),
    readText: async (p) => writes.get(p) ?? files[p] ?? null,
  };
  const initDeps = {
    ...io,
    writeText: async (p: string, d: string) => void writes.set(p, d),
    now: () => new Date('2026-11-13T10:20:30.000Z'),
  };
  return { io, initDeps, out, err, writes };
}

const base = ['--quadro', 'Q', '--escritorio', 'E', '--mapa', 'M'];

describe('team:check', () => {
  it('CA-12: consistent team exits 0', async () => {
    const m = memIo({ Q: quadroText, E: proposalText, M: mapText });
    expect(await runTeamCli(['team:check', ...base], { io: m.io })).toBe(0);
    expect(m.out.join('\n')).toContain('OK: equipe consistente.');
    expect(m.out.join('\n')).toContain('16 agentes no QUADRO.md, 16 NPCs');
  });

  it('CA-21: agent without NPC makes it fail (exit 1) with a clear line', async () => {
    const raw = JSON.parse(proposalText);
    raw.agents = raw.agents.filter((a: { agentType: string }) => a.agentType !== 'pentester');
    const m = memIo({ Q: quadroText, E: JSON.stringify(raw), M: mapText });
    expect(await runTeamCli(['team:check', ...base], { io: m.io })).toBe(1);
    expect(m.out.join('\n')).toMatch(/ERRO\s+QUADRO\.md: Agente sem NPC: pentester/);
  });

  it('CA-21: NPC without agent, missing desk and invalid department are all reported', async () => {
    const raw = JSON.parse(proposalText);
    raw.agents.push({
      ...raw.agents[1],
      agentType: 'fantasma',
      nickname: 'Fantasma',
      desk: 'PLN-77',
    });
    const m1 = memIo({ Q: quadroText, E: JSON.stringify(raw), M: mapText });
    expect(await runTeamCli(['team:check', ...base], { io: m1.io })).toBe(1);
    const text = m1.out.join('\n');
    expect(text).toContain('NPC sem agente: fantasma');
    expect(text).toContain('Mesa inexistente no mapa: PLN-77');

    raw.agents[2].department = 'nao-existe';
    const m2 = memIo({ Q: quadroText, E: JSON.stringify(raw), M: mapText });
    expect(await runTeamCli(['team:check', ...base, '--lang', 'en'], { io: m2.io })).toBe(1);
    expect(m2.out.join('\n')).toContain('Invalid department: nao-existe');
  });

  it('CA-21: duplicate desk is reported by name', async () => {
    const raw = JSON.parse(proposalText);
    raw.agents[2].desk = raw.agents[1].desk;
    const m = memIo({ Q: quadroText, E: JSON.stringify(raw), M: mapText });
    expect(await runTeamCli(['team:check', ...base], { io: m.io })).toBe(1);
    expect(m.out.join('\n')).toContain(`Mesa duplicada: ${raw.agents[1].desk}`);
  });

  it('CA-13: invalid escritorio.json fails with the field path', async () => {
    const raw = JSON.parse(proposalText);
    delete raw.agents[4].title;
    const m = memIo({ Q: quadroText, E: JSON.stringify(raw), M: mapText });
    expect(await runTeamCli(['team:check', ...base], { io: m.io })).toBe(1);
    expect(m.out.join('\n')).toContain('escritorio.json agents.4.title');
  });

  it('missing input is a usage-level failure (exit 2), not a consistency failure', async () => {
    const m = memIo({ Q: quadroText });
    expect(await runTeamCli(['team:check', ...base], { io: m.io })).toBe(2);
    expect(m.err.join('\n')).toContain('escritorio.json não encontrado');
  });

  it('a missing default map is skipped, an explicit one is an error', async () => {
    const m = memIo({ Q: quadroText, E: proposalText });
    expect(
      await runTeamCli(['team:check', '--quadro', 'Q', '--escritorio', 'E'], { io: m.io }),
    ).toBe(0);
    expect(m.out.join('\n')).toContain('verificações de mesa/sala puladas');
    expect(
      await runTeamCli(['team:check', ...base], {
        io: memIo({ Q: quadroText, E: proposalText }).io,
      }),
    ).toBe(2);
  });

  it('unknown options and commands exit 2', async () => {
    const m = memIo({});
    expect(await runTeamCli(['team:check', '--bogus'], { io: m.io })).toBe(2);
    expect(await runTeamCli(['team:nope'], { io: m.io })).toBe(2);
    expect(await runTeamCli(['team:check', '--quadro'], { io: m.io })).toBe(2);
  });
});

describe('team:init', () => {
  const opts = ['--proposal', 'P', '--dest', 'D'];

  it('CA-12: refuses without --confirm-approved and writes nothing', async () => {
    const m = memIo({ P: proposalText });
    expect(await runTeamCli(['team:init', ...opts], { io: m.io, initDeps: m.initDeps })).toBe(2);
    expect(m.writes.size).toBe(0);
    expect(m.err.join('\n')).toContain('--confirm-approved');
  });

  it('CA-12: with the flag it copies the validated proposal verbatim', async () => {
    const m = memIo({ P: proposalText });
    const code = await runTeamCli(['team:init', '--confirm-approved', ...opts], {
      io: m.io,
      initDeps: m.initDeps,
    });
    expect(code).toBe(0);
    expect(m.writes.get('D')).toBe(proposalText);
  });

  it('refuses an invalid proposal and an existing destination', async () => {
    const bad = memIo({ P: '{"schema":"escritorio/v1"}' });
    expect(
      await runTeamCli(['team:init', '--confirm-approved', ...opts], {
        io: bad.io,
        initDeps: bad.initDeps,
      }),
    ).toBe(1);
    expect(bad.writes.size).toBe(0);

    const exists = memIo({ P: proposalText, D: '{"old":true}' });
    expect(
      await runTeamCli(['team:init', '--confirm-approved', ...opts], {
        io: exists.io,
        initDeps: exists.initDeps,
      }),
    ).toBe(1);
    expect(exists.writes.size).toBe(0);
  });

  it('--overwrite keeps a timestamped backup of the previous file', async () => {
    const m = memIo({ P: proposalText, D: '{"old":true}' });
    const code = await runTeamCli(['team:init', '--confirm-approved', '--overwrite', ...opts], {
      io: m.io,
      initDeps: m.initDeps,
    });
    expect(code).toBe(0);
    expect(m.writes.get('D.bak-20261113T102030')).toBe('{"old":true}');
    expect(m.writes.get('D')).toBe(proposalText);
  });
});

describe('CLI messages', () => {
  it('pt-BR and en catalogs have exactly the same keys', () => {
    expect(Object.keys(CLI_CATALOGS.en).sort()).toEqual(Object.keys(CLI_CATALOGS['pt-BR']).sort());
  });
});
