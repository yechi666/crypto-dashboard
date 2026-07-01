// Client runtime config derived from Vite env (VITE_* only). Falls back to sane defaults.
export const STALE_AFTER_MS = Number(import.meta.env.VITE_STALE_AFTER_MS) || 60000;
export const POLL_INTERVAL_MS = Number(import.meta.env.VITE_POLL_INTERVAL_MS) || 30000;
