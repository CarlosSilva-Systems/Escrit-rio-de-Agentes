import { runTeamCli } from './index';

// Stand-alone entry for `team:*` (used with tsx while the main CLI, src/cli/escritorio.ts,
// does not exist yet; the main CLI should dispatch `team:*` to runTeamCli).
runTeamCli(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  () => {
    process.exitCode = 2;
  },
);
