import type { HistoryPointDto } from "../api/types";

export interface HistoryStats {
  latest: number | null;
  high: number | null;
  low: number | null;
  changePct: number | null;
}

/**
 * Derive summary stats from history points (prices arrive as strings).
 * Returns all nulls for an empty list.
 */
export function historyStats(points: HistoryPointDto[]): HistoryStats {
  if (points.length === 0) {
    return { latest: null, high: null, low: null, changePct: null };
  }

  const values = points.map((p) => Number(p.price));

  const latest = values[values.length - 1];
  const high = Math.max(...values);
  const low = Math.min(...values);

  const first = values[0];
  const changePct = first ? ((latest - first) / first) * 100 : null;

  return { latest, high, low, changePct };
}

/**
 * Build an SVG polyline `points` string for a sparkline, scaling values into a
 * [0..width] x [0..height] box (y is inverted so a higher price sits higher on screen).
 * Returns "" when there are fewer than 2 values.
 */
export function buildSparklinePath(values: number[], width: number, height: number): string {
  if (values.length < 2) return "";

  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min;

  return values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = range === 0 ? height / 2 : height - ((v - min) / range) * height;
      return `${x},${y}`;
    })
    .join(" ");
}
