/**
 * Resolve the `since` cutoff for a history query from a raw ?minutes value.
 * Defaults to 60 minutes when absent/invalid/non-positive; clamps to maxMinutes
 * (the retention window). `now` is injectable for deterministic tests.
 */
export function resolveHistorySince(
  rawMinutes: unknown,
  maxMinutes: number,
  now: number = Date.now(),
): Date {
  const raw = Number(rawMinutes);
  let minutes = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 60;
  minutes = Math.min(minutes, maxMinutes);
  return new Date(now - minutes * 60_000);
}
