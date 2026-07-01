const DASH = "—";

/**
 * Full (non-compact) USD currency formatting, e.g. "$58,683.10".
 * Sub-$1 prices get extra fraction digits (up to 6) so sub-cent coins don't
 * all collapse to "$0.00".
 */
export function formatCurrency(value: string | number): string {
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
