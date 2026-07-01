import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  POLL_INTERVAL_MS: z.coerce.number().int().positive().default(30_000),
  COIN_COUNT: z.coerce.number().int().positive().default(20),
  STALE_AFTER_INTERVALS: z.coerce.number().positive().default(2),
  HISTORY_RETENTION_HOURS: z.coerce.number().int().positive().default(24),
  COINGECKO_API_KEY: z.string().optional().default(""),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
