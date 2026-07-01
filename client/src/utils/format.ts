import type { FreshnessStatus } from "../api/types";

const DASH = "—";

/**
 * Full (non-compact) USD currency formatting, e.g. "$58,683.10".
 * Sub-$1 prices get extra fraction digits (up to 6) so sub-cent coins don't
 * all collapse to "$0.00".
 */
export function formatCurrency(value: string | number | null): string {
  if (value === null) return DASH;
  const num = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(num)) return DASH;

  const maximumFractionDigits = Math.abs(num) < 1 ? 6 : 2;

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits,
  }).format(num);
}

/**
 * Compact USD currency formatting, e.g. "$1.18T", "$25.5B".
 */
export function formatCompactCurrency(value: string | number | null): string {
  if (value === null) return DASH;
  const num = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(num)) return DASH;

  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(num);
}

/**
 * Signed percentage formatting, 2 decimals, e.g. "+1.37%", "-1.37%".
 */
export function formatPercent(value: number | null): string {
  if (value === null || Number.isNaN(value)) return DASH;

  return new Intl.NumberFormat("en-US", {
    style: "percent",
    signDisplay: "exceptZero",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value / 100);
}

/**
 * Determines the direction of a price change for styling purposes.
 * Returns "up" for positive values, "down" for negative, "neutral" for zero or null.
 */
export function changeDirection(value: number | null): "up" | "down" | "neutral" {
  if (value === null || value === 0) return "neutral";
  return value > 0 ? "up" : "down";
}

/**
 * Formats an ISO timestamp as a coarse relative time, e.g. "just now", "30s ago",
 * "1m ago", "2h ago". Accepts an explicit `now` for deterministic tests.
 */
export function formatRelativeTime(iso: string | null, now: number = Date.now()): string {
  if (!iso) return "never";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return DASH;
  const diffSec = Math.max(0, Math.round((now - then) / 1000));
  if (diffSec < 2) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  return `${hr}h ago`;
}

/**
 * Formats an ISO timestamp as a short clock time, e.g. "2:45 PM".
 * Returns a dash for an invalid timestamp.
 */
export function formatClockTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return DASH;
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/**
 * Effective freshness combining the server-reported status with client-side age:
 * a stream that hasn't delivered data within thresholdMs is treated as stale even
 * if the socket still claims to be connected. Precedence: error > age-stale > server status.
 */
export function effectiveFreshness(
  status: FreshnessStatus,
  ageMs: number,
  thresholdMs: number,
): FreshnessStatus {
  if (status === "error") return "error";
  if (ageMs > thresholdMs) return "stale";
  return status;
}
