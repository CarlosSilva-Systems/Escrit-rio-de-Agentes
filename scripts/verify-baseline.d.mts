export interface BaselineRoot {
  id: string;
  kind: 'tree' | 'scripts' | 'files';
  path: string;
  files?: string[];
}
export interface RootSnapshot {
  kind: string;
  fileCount: number;
  aggregate: string;
  files: Record<string, string>;
}
export type Snapshot = Record<string, RootSnapshot>;
export const BASELINE_FILE: string;
export function defaultRoots(home?: string, appData?: string): BaselineRoot[];
export function computeSnapshot(roots: BaselineRoot[]): Snapshot;
export function compareSnapshots(expected: Snapshot, actual: Snapshot): string[];
export function buildBaseline(
  roots: BaselineRoot[],
  now?: Date,
): { version: number; note: string; createdAt: string; roots: Snapshot };
export function verify(
  baseline: { roots: Snapshot },
  roots: BaselineRoot[],
): { identical: boolean; diffs: string[] };
