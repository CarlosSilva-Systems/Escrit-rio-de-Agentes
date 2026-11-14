export interface Pair {
  id: string;
  section: string;
  fg: string;
  bg: string;
  doc: number;
  min: number;
}
export interface AuditRow extends Pair {
  fgHex?: string;
  bgHex?: string;
  ratio: number;
  delta: number;
  passes: boolean;
  diverges: boolean;
  missing: boolean;
}
export interface UsageRow {
  selector: string;
  fg: string;
  bg: string;
  worst: number;
  exempt: boolean;
  passes: boolean;
}
export const DOCS_TOKENS: string;
export const WEB_TOKENS: string;
export const APP_CSS: string;
export const MIN_TEXT: number;
export const MIN_UI: number;
export const DIVERGENCE: number;
export const DOCUMENTED_NEGATIVES: { fg: string; bg: string; doc: number; note: string }[];
export function parseTokens(css: string): Record<string, string>;
export function hexToRgb(hex: string): number[];
export function luminance(hex: string): number;
export function contrastRatio(fg: string, bg: string): number;
export function documentedPairs(): Pair[];
export function auditPairs(tokens: Record<string, string>, pairs?: Pair[]): AuditRow[];
export function tokenMismatches(
  a: Record<string, string>,
  b: Record<string, string>,
): { name: string; docs: string; web: string }[];
export function scanCssUsage(css: string, tokens: Record<string, string>): UsageRow[];
export function runAudit(read?: (path: string) => string): {
  audit: AuditRow[];
  failing: AuditRow[];
  diverging: AuditRow[];
  mismatches: { name: string; docs: string; web: string }[];
  usage: UsageRow[];
  usageFailing: UsageRow[];
  departmentsCovered: boolean;
};
