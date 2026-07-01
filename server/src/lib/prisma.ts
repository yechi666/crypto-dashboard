import type { Prisma } from "@prisma/client";
import { PrismaClient } from "@prisma/client";

// Single shared PrismaClient instance for the process, matching Prisma's
// recommended pattern (a new client per request/module exhausts DB connections).
export const prisma = new PrismaClient();

/**
 * Run a batch of prisma operations atomically. Lets services build up ops via
 * repository op-builders and commit them transactionally without importing
 * `prisma` themselves.
 */
export function runTransaction(ops: Prisma.PrismaPromise<unknown>[]) {
  return prisma.$transaction(ops);
}
