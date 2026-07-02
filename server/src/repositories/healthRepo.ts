import { prisma } from "../lib/prisma.js";

/**
 * Cheap connectivity check used by the readiness probe. Swallows any error
 * and reports `false` rather than throwing — the caller only needs a
 * boolean, and raw DB access stays confined to the repository layer.
 */
export async function pingDatabase(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
