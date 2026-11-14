// CA-18: when no hook (Level 1/2) is installed and no event of any kind has reached the office, say
// so quietly: Claude Desktop sessions are not being seen. Uses only server counters.

export function desktopNotDetected(counters: Readonly<Record<string, number>>): boolean {
  const level = counters['settings.level'] ?? 0;
  const events =
    (counters['office.events'] ?? 0) +
    (counters['jsonl.events'] ?? 0) +
    (counters['ingest.accepted'] ?? 0);
  return level === 0 && events === 0;
}
