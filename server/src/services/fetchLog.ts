import { logger } from "../lib/logger.js";
import { prisma } from "../lib/prisma.js";

export interface FetchLogOutcome {
  status: "SUCCEEDED" | "FAILED";
  finishedAt: Date;
  coinsUpdated?: number;
  errorMessage?: string;
}

/**
 * Create a PROCESSING FetchLog row marking the start of a poll attempt.
 * Tolerates (and logs) its own failure rather than throwing, so a logging
 * problem never prevents the actual refresh cycle from running.
 */
export async function createProcessingLog(
  source: string,
  startedAt: Date,
): Promise<{ id: number } | null> {
  try {
    return await prisma.fetchLog.create({
      data: { source, status: "PROCESSING", startedAt },
    });
  } catch (e) {
    logger.error({ err: e }, "failed to create PROCESSING FetchLog; continuing");
    return null;
  }
}

/**
 * Persist the final FetchLog outcome: updates the PROCESSING row by id when
 * one exists, otherwise creates a fresh row so the outcome is never lost.
 * Tolerates (and logs) its own failure; never throws.
 */
export async function recordOutcome(
  logId: number | null,
  startedAt: Date,
  outcome: FetchLogOutcome,
): Promise<void> {
  try {
    if (logId != null) {
      await prisma.fetchLog.update({ where: { id: logId }, data: outcome });
    } else {
      await prisma.fetchLog.create({ data: { source: "coincap", startedAt, ...outcome } });
    }
  } catch (e) {
    logger.error({ err: e }, "failed to record FetchLog outcome");
  }
}
