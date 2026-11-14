import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveHomePaths } from '../home/paths';
import { applySettings } from './apply';
import { proposeSettings } from './diff';
import { stableStringify } from './format';
import { REAL_PATH_FLAG, isRealUserSettings } from './guards';
import { MARKER, planHooks } from './hookCommand';
import { detectInstalled } from './merge';
import { revertSettings } from './revert';
import { buildSessionSettings, writeSessionSettings } from './sessionSettings';
import { syncHookRuntime } from './hookInstall';

const PIXEL = 'node "C:\\Users\\x\\.pixel-agents\\hooks\\claude-hook.js"';
const PIXEL_SL = 'node "C:\\Users\\x\\.pixel-agents\\hooks\\claude-statusline.js"';
const group = { matcher: '', hooks: [{ type: 'command', command: PIXEL, timeout: 5 }] };
const sample = {
  agent: 'chefe',
  env: { SOME_VALUE: 'keep-me' },
  statusLine: { type: 'command', command: PIXEL_SL },
  hooks: Object.fromEntries(
    [
      'SessionStart',
      'SessionEnd',
      'Stop',
      'PermissionRequest',
      'Notification',
      'PreToolUse',
      'PostToolUse',
      'PostToolUseFailure',
      'SubagentStart',
      'SubagentStop',
      'TeammateIdle',
      'TaskCompleted',
    ].map((e) => [e, [group]]),
  ),
};
const SAMPLE_TEXT = `${JSON.stringify(sample, null, 2)}\n`;

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
function workdir() {
  const dir = mkdtempSync(join(tmpdir(), 'settings-'));
  dirs.push(dir);
  const binDir = join(dir, '.escritorio-equipe', 'bin');
  mkdirSync(binDir, { recursive: true });
  writeFileSync(join(binDir, 'escritorio-hook.cjs'), '// stub');
  writeFileSync(join(binDir, 'escritorio-statusline.cjs'), '// stub');
  const file = join(dir, 'settings.json'); // a COPY: never the real file
  writeFileSync(file, SAMPLE_TEXT);
  return { dir, binDir, file, real: join(dir, 'real', 'settings.json') };
}

describe('settings:diff (T-18)', () => {
  it('CA-20: level 1 is additive: existing groups untouched, ours appended, 2 new events, marker present', () => {
    const { binDir } = workdir();
    const r = proposeSettings(SAMPLE_TEXT, { level: 1, binDir });
    if (!r.ok) throw new Error('expected ok');
    const next = r.settings as typeof sample & { hooks: Record<string, unknown[]> };
    expect(next.agent).toBe('chefe');
    expect(next.env).toEqual(sample.env);
    expect(next.statusLine).toEqual(sample.statusLine);
    for (const event of Object.keys(sample.hooks)) {
      const groups = next.hooks[event] as unknown[];
      expect(groups[0]).toEqual(group); // Pixel Agents' group intact and first
      if (event === 'TeammateIdle') expect(groups).toHaveLength(1);
      else expect(JSON.stringify(groups[1])).toContain(MARKER);
    }
    expect(Object.keys(next.hooks)).toEqual(
      expect.arrayContaining(['UserPromptSubmit', 'TaskCreated']),
    );
    expect(r.diff).toContain('+++ settings.json (proposto, nível 1)');
    expect(r.changes.hooksAdded).toHaveLength(13);
  });

  it('CA-39: PermissionRequest hook timeout = approval deadline + 15 s, observers 3 s', () => {
    const plan = planHooks({ binDir: 'C:\\b', approvalDeadlineSec: 60 });
    expect(plan['PermissionRequest']?.[0]?.hooks[0]?.timeout).toBe(75);
    expect(plan['PreToolUse']?.[0]?.hooks[0]?.timeout).toBe(3);
    expect(plan['PreToolUse']?.[0]?.hooks[0]?.command).toBe(
      'node "C:/b/escritorio-hook.cjs"'.replace('C:/b', 'C:/b'),
    );
  });

  it('CA-20: running it again proposes nothing (idempotent)', () => {
    const { binDir } = workdir();
    const first = proposeSettings(SAMPLE_TEXT, { level: 1, binDir });
    if (!first.ok) throw new Error('expected ok');
    const second = proposeSettings(first.after, { level: 1, binDir });
    expect(second.ok && second.diff).toBe('');
    expect(second.ok && second.after).toBe(first.after);
  });

  it('CA-59: level 2 wraps the existing statusLine (base64url) and touches nothing else', () => {
    const { binDir } = workdir();
    const r = proposeSettings(SAMPLE_TEXT, { level: 2, binDir });
    if (!r.ok) throw new Error('expected ok');
    const sl = (r.settings as typeof sample).statusLine.command;
    expect(sl).toContain(MARKER);
    const wrapped = /--wrap (\S+)$/.exec(sl)?.[1] ?? '';
    expect(Buffer.from(wrapped, 'base64url').toString('utf8')).toBe(PIXEL_SL);
    expect((r.settings as typeof sample).hooks).toEqual(sample.hooks);
  });

  it('CA-20: invalid JSON and wrong shapes are refused, never rewritten', () => {
    const { binDir } = workdir();
    expect(proposeSettings('{ nope', { level: 1, binDir })).toMatchObject({ code: 'invalid-json' });
    expect(proposeSettings('[]', { level: 1, binDir })).toMatchObject({ code: 'not-object' });
    expect(proposeSettings('{"hooks":[]}', { level: 1, binDir })).toMatchObject({
      code: 'hooks-not-object',
    });
    expect(proposeSettings('{"hooks":{"Stop":{}}}', { level: 1, binDir })).toMatchObject({
      code: 'event-not-array',
    });
  });

  it('CA-20: a missing file proposes a new one; CRLF/BOM/tab formatting is preserved', () => {
    const { binDir } = workdir();
    const created = proposeSettings(null, { level: 1, binDir });
    expect(created.ok && created.after.startsWith('{\n  "hooks"')).toBe(true);
    const crlf = `\uFEFF${JSON.stringify(sample, null, '\t').replace(/\n/g, '\r\n')}`;
    const r = proposeSettings(crlf, { level: 1, binDir });
    if (!r.ok) throw new Error('expected ok');
    expect(r.after.startsWith('\uFEFF{\r\n\t')).toBe(true);
    expect(r.after.endsWith('}')).toBe(true);
  });
});

describe('settings:apply / revert on a COPY (T-18)', () => {
  it('CA-20: apply needs the exact word, makes a dated backup, validates; revert restores byte for byte', async () => {
    const { file, binDir } = workdir();
    const base = { settingsPath: file, level: 1 as const, binDir, realSettingsPath: '/none' };
    expect(await applySettings({ ...base, confirm: 'aplicar' })).toEqual({
      ok: false,
      code: 'confirmation-required',
    });
    expect(readFileSync(file, 'utf8')).toBe(SAMPLE_TEXT);

    const applied = await applySettings({ ...base, confirm: 'APLICAR' });
    if (!applied.ok) throw new Error(`apply failed: ${applied.code}`);
    expect(applied.backupPath).toMatch(/settings\.json\.bak-\d{8}-\d{6}$/);
    expect(readFileSync(applied.backupPath as string, 'utf8')).toBe(SAMPLE_TEXT);
    const now = JSON.parse(readFileSync(file, 'utf8')) as typeof sample;
    expect(detectInstalled(now).level).toBe(1);
    expect(now.env).toEqual(sample.env);

    const again = await applySettings({ ...base, confirm: 'APLICAR' });
    expect(again).toMatchObject({ ok: true, changed: false });

    const reverted = await revertSettings({ settingsPath: file, realSettingsPath: '/none' });
    if (!reverted.ok) throw new Error('revert failed');
    expect(reverted.restoredFrom).toBe(applied.backupPath);
    expect(readFileSync(file, 'utf8')).toBe(SAMPLE_TEXT); // byte for byte
  });

  it('CA-59: level 2 apply + revert restores the original statusLine', async () => {
    const { file, binDir } = workdir();
    const base = { settingsPath: file, binDir, realSettingsPath: '/none' };
    const a = await applySettings({ ...base, level: 2, confirm: 'APLICAR' });
    expect(a.ok).toBe(true);
    expect(detectInstalled(JSON.parse(readFileSync(file, 'utf8'))).level).toBe(2);
    const r = await revertSettings({ settingsPath: file, realSettingsPath: '/none' });
    expect(r.ok && r.changes.statusLine).toBe('restored');
    expect(readFileSync(file, 'utf8')).toBe(SAMPLE_TEXT);
  });

  it('CA-20: revert without any backup removes only ours (hand-edited file keeps its other changes)', async () => {
    const { file, binDir } = workdir();
    await applySettings({
      settingsPath: file,
      level: 1,
      binDir,
      confirm: 'APLICAR',
      realSettingsPath: '/none',
    });
    for (const f of readdirSync(join(file, '..')).filter((n) => n.includes('.bak-'))) {
      rmSync(join(file, '..', f));
    }
    const edited = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
    edited['theme'] = 'dark';
    writeFileSync(file, `${JSON.stringify(edited, null, 2)}\n`);
    const r = await revertSettings({ settingsPath: file, realSettingsPath: '/none' });
    expect(r.ok && r.restoredFrom).toBeNull();
    const out = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
    expect(stableStringify(out)).toBe(stableStringify({ ...sample, theme: 'dark' }));
  });

  it('CA-20: apply refuses when the hook script was not synced yet', async () => {
    const { file, dir } = workdir();
    const r = await applySettings({
      settingsPath: file,
      level: 1,
      binDir: join(dir, '.escritorio-equipe', 'empty'),
      confirm: 'APLICAR',
      realSettingsPath: '/none',
    });
    expect(r).toMatchObject({ ok: false, code: 'script-missing' });
  });

  it('CA-20: the real settings path is refused without the long flag (apply and revert)', async () => {
    const { file, binDir } = workdir();
    const opts = { settingsPath: file, realSettingsPath: file };
    expect(await applySettings({ ...opts, level: 1, binDir, confirm: 'APLICAR' })).toEqual({
      ok: false,
      code: 'real-path-refused',
    });
    expect(await revertSettings(opts)).toEqual({ ok: false, code: 'real-path-refused' });
    expect(readFileSync(file, 'utf8')).toBe(SAMPLE_TEXT);
    expect(REAL_PATH_FLAG).toBe('--i-am-carlo-and-approved');
    expect(isRealUserSettings(file.toUpperCase(), file)).toBe(true);
  });
});

describe('panel session settings (T-17, Level 0)', () => {
  it('CA-15: hooks are in the panel file, and left out when Level 1 is detected', async () => {
    const { dir, file, binDir } = workdir();
    const paths = resolveHomePaths(join(dir, '.escritorio-equipe'));
    expect(buildSessionSettings({ binDir, includeHooks: false })).toEqual({});
    const level0 = await writeSessionSettings(paths, { userSettingsPath: file });
    expect(level0.includeHooks).toBe(true);
    expect(JSON.parse(readFileSync(level0.file, 'utf8')).hooks.PermissionRequest).toBeDefined();
    await applySettings({
      settingsPath: file,
      level: 1,
      binDir: paths.binDir,
      confirm: 'APLICAR',
      realSettingsPath: '/none',
    });
    const level1 = await writeSessionSettings(paths, { userSettingsPath: file });
    expect(level1.includeHooks).toBe(false);
    expect(JSON.parse(readFileSync(level1.file, 'utf8'))).toEqual({});
  });

  it('CA-15: hooks:sync copies the scripts atomically with a manifest', async () => {
    const { dir } = workdir();
    const paths = resolveHomePaths(join(dir, 'home2'));
    const src = join(import.meta.dirname, '..', '..', 'hook-runtime');
    const r = await syncHookRuntime(paths, src);
    expect(r.copied).toContain('escritorio-hook.cjs');
    expect(r.version).toBeGreaterThan(0);
    expect(readFileSync(join(paths.binDir, 'escritorio-hook.cjs'), 'utf8')).toBe(
      readFileSync(join(src, 'escritorio-hook.cjs'), 'utf8'),
    );
  });
});
