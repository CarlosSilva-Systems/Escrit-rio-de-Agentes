import { writeFileAtomic } from '../../server/team/atomicWrite';
import { parseEscritorioText } from '../../server/team/validate';
import { renderDiagnostic } from './check';
import type { CliIo } from './check';
import { tr } from './messages';
import type { CliLang } from './messages';

// `team:init`: copies the APPROVED proposal to the destination (normally
// ~/.claude/equipe/escritorio.json). It never runs by default: it requires the explicit
// `--confirm-approved` flag (gate G1: Carlos approves the name list first), validates the
// proposal against the escritorio/v1 contract before writing and never overwrites silently.

export interface TeamInitOptions {
  proposalPath: string;
  destPath: string;
  confirmApproved: boolean;
  overwrite: boolean;
  lang: CliLang;
}

export interface InitDeps extends CliIo {
  writeText(path: string, data: string): Promise<void>;
  /** Injected clock for the backup suffix. */
  now(): Date;
}

export const defaultInitDeps = (io: CliIo): InitDeps => ({
  ...io,
  writeText: (path, data) => writeFileAtomic(path, data),
  now: () => new Date(),
});

export async function runTeamInit(opts: TeamInitOptions, deps: InitDeps): Promise<number> {
  const { lang } = opts;
  if (!opts.confirmApproved) {
    deps.err(tr(lang, 'init.needs-confirm'));
    return 2;
  }
  const proposal = await deps.readText(opts.proposalPath);
  if (proposal === null) {
    deps.err(tr(lang, 'init.proposal-missing', { path: opts.proposalPath }));
    return 2;
  }
  const parsed = parseEscritorioText(proposal);
  if (!parsed.ok) {
    deps.err(tr(lang, 'init.proposal-invalid'));
    for (const d of parsed.diagnostics) deps.err(renderDiagnostic(lang, d));
    return 1;
  }
  const existing = await deps.readText(opts.destPath);
  if (existing !== null) {
    if (!opts.overwrite) {
      deps.err(tr(lang, 'init.dest-exists', { path: opts.destPath }));
      return 1;
    }
    const stamp = deps.now().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '');
    const backup = `${opts.destPath}.bak-${stamp}`;
    await deps.writeText(backup, existing);
    deps.out(tr(lang, 'init.backup', { path: backup }));
  }
  await deps.writeText(opts.destPath, proposal);
  deps.out(tr(lang, 'init.written', { path: opts.destPath }));
  deps.out(tr(lang, 'init.next'));
  return 0;
}
