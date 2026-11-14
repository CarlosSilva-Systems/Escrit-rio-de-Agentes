import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runTeamCli } from '../../src/cli/team';
import { writeFileAtomic } from '../../src/server/home/fsAtomic';
import { createFsTeamWatcher, readTextOrNull, TeamRegistry } from '../../src/server/team';
import type { TeamChange } from '../../src/server/team';

const fixtures = join(import.meta.dirname, '..', 'fixtures');
const proposalText = readFileSync(join(fixtures, 'escritorio', 'proposta.valid.json'), 'utf8');
const quadroText = readFileSync(join(fixtures, 'team', 'QUADRO.sample.md'), 'utf8');
const mapText = readFileSync(join(fixtures, 'team', 'mapa-index.json'), 'utf8');

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'team-'));
  dirs.push(d);
  return d;
};

function waitFor(predicate: () => boolean, ms = 4000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      if (predicate()) return resolve();
      if (Date.now() - start > ms) return reject(new Error('timeout waiting for condition'));
      setTimeout(tick, 25);
    };
    tick();
  });
}

describe('TeamRegistry with real files and watcher (CA-12, CA-13, CA-17, CA-21)', () => {
  it('CA-13/CA-21: file appears, becomes invalid, then valid with a hire: no reload of the process needed', async () => {
    const dir = tmp();
    const escritorio = join(dir, 'escritorio.json');
    const quadro = join(dir, 'QUADRO.md');
    writeFileSync(quadro, quadroText);

    const registry = new TeamRegistry({
      escritorioPath: escritorio,
      quadroPath: quadro,
      readText: readTextOrNull,
      watcher: createFsTeamWatcher({ debounceMs: 30 }),
      retryDelayMs: 10,
    });
    const changes: TeamChange[] = [];
    registry.onChange((c) => changes.push(c));

    // 1. No escritorio.json yet: reserve team from QUADRO.md (16) + file diagnostic.
    const first = await registry.start();
    expect(first.snapshot.source).toBe('quadro-fallback');
    expect(first.snapshot.view.agents).toHaveLength(16);
    expect(first.snapshot.diagnostics[0]?.code).toBe('team.file-missing');

    // 2. The approved file is created: picked up by the watcher.
    await writeFileAtomic(escritorio, proposalText);
    await waitFor(() => registry.snapshot?.source === 'escritorio');
    expect(registry.snapshot?.view.source).toBe('escritorio');
    expect(registry.resolve({ agentType: 'dev-backend' })).toMatchObject({
      kind: 'fixed',
      key: 'dev-backend',
    });

    // 3. Broken edit: last valid is kept, diagnostic names the field.
    const broken = JSON.parse(proposalText);
    delete broken.agents[2].fullName;
    await writeFileAtomic(escritorio, JSON.stringify(broken));
    await waitFor(() => registry.snapshot?.source === 'last-valid');
    expect(registry.snapshot?.diagnostics.map((d) => d.path)).toContain('agents.2.fullName');
    expect(registry.snapshot?.view.agents).toHaveLength(16);

    // 4. A hire without a free desk: team.diff event with the provisional warning.
    const hired = JSON.parse(proposalText);
    hired.agents.push({
      ...hired.agents[1],
      agentType: 'novato',
      nickname: 'Nova',
      desk: null,
      provisional: true,
    });
    await writeFileAtomic(escritorio, JSON.stringify(hired));
    await waitFor(
      () => registry.snapshot?.view.agents.some((a) => a.agentType === 'novato') === true,
    );
    const diff = changes.map((c) => c.diff).find((d) => d && !d.initial && d.added.length > 0);
    expect(diff?.added.map((a) => a.agentType)).toEqual(['novato']);
    expect(diff?.provisionalAdded).toEqual(['novato']);
    expect(registry.resolve({ agentType: 'novato', agentId: 'x' }).kind).toBe('fixed');

    registry.stop();
  });

  it('CA-13: a watcher on a not-yet-existing directory attaches when it is created', async () => {
    const base = tmp();
    const dir = join(base, 'equipe');
    const registry = new TeamRegistry({
      escritorioPath: join(dir, 'escritorio.json'),
      quadroPath: join(dir, 'QUADRO.md'),
      readText: readTextOrNull,
      watcher: createFsTeamWatcher({ debounceMs: 20, missingDirPollMs: 40 }),
      retryDelayMs: 5,
    });
    const first = await registry.start();
    expect(first.snapshot.view.agents.map((a) => a.agentType)).toEqual(['chefe']); // nothing at all
    await writeFileAtomic(join(dir, 'QUADRO.md'), quadroText);
    await waitFor(() => registry.snapshot?.view.agents.length === 16);
    registry.stop();
  });
});

describe('team:check / team:init on real files (CA-12, CA-21)', () => {
  const run = async (argv: string[], home: string) => {
    const out: string[] = [];
    const err: string[] = [];
    const code = await runTeamCli(argv, {
      home,
      io: { out: (l) => out.push(l), err: (l) => err.push(l), readText: readTextOrNull },
    });
    return { code, out: out.join('\n'), err: err.join('\n') };
  };

  it('CA-12: init requires the flag; with it, the written file passes team:check', async () => {
    const home = tmp();
    const dir = join(home, 'fx');
    writeFileSync(join(home, 'p.json'), proposalText);
    writeFileSync(join(home, 'QUADRO.md'), quadroText);
    writeFileSync(join(home, 'mapa.json'), mapText);
    const dest = join(dir, 'escritorio.json');
    const common = ['--proposal', join(home, 'p.json'), '--dest', dest];

    const refused = await run(['team:init', ...common], home);
    expect(refused.code).toBe(2);
    expect(await readTextOrNull(dest)).toBeNull();

    const done = await run(['team:init', '--confirm-approved', ...common], home);
    expect(done.code).toBe(0);
    expect(readFileSync(dest, 'utf8')).toBe(proposalText);

    const check = await run(
      [
        'team:check',
        '--quadro',
        join(home, 'QUADRO.md'),
        '--escritorio',
        dest,
        '--mapa',
        join(home, 'mapa.json'),
      ],
      home,
    );
    expect(check.code).toBe(0);
    expect(check.out).toContain('OK');

    const again = await run(['team:init', '--confirm-approved', ...common], home);
    expect(again.code).toBe(1); // exists: not overwritten
    expect(readFileSync(dest, 'utf8')).toBe(proposalText);
  });

  it('CA-21: team:check fails when QUADRO.md has an agent the escritorio.json lacks', async () => {
    const home = tmp();
    writeFileSync(
      join(home, 'QUADRO.md'),
      `${quadroText.replace('| pesquisador |', '| novo-agente | Nova | Apoio | x | haiku | y |\n| pesquisador |')}`,
    );
    writeFileSync(join(home, 'e.json'), proposalText);
    const r = await run(
      [
        'team:check',
        '--quadro',
        join(home, 'QUADRO.md'),
        '--escritorio',
        join(home, 'e.json'),
        '--mapa',
        join(home, 'none.json'),
      ],
      home,
    );
    expect(r.code).toBe(2); // explicit missing map
    const r2 = await run(
      ['team:check', '--quadro', join(home, 'QUADRO.md'), '--escritorio', join(home, 'e.json')],
      home,
    );
    expect(r2.code).toBe(1);
    expect(r2.out).toContain('Agente sem NPC: novo-agente');
  });
});
