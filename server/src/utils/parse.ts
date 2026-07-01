/** Parse a possibly-missing/empty numeric string to an int, or null. */
export function parseIntOrNull(value: string | undefined | null): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

/** Parse a possibly-missing/empty numeric string to a float, or null. */
export function parseFloatOrNull(value: string | undefined | null): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? null : parsed;
}

/** Keep a possibly-missing/empty string as-is, or null. */
export function stringOrNull(value: string | undefined | null): string | null {
  if (value === undefined || value === null || value === "") return null;
  return value;
}
