// Client runtime config derived from Vite env (VITE_* only). Falls back to sane defaults.
export const STALE_AFTER_MS = Number(import.meta.env.VITE_STALE_AFTER_MS) || 60000;
