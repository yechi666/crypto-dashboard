import { PrismaClient } from "@prisma/client";

// Single shared PrismaClient instance for the process, matching Prisma's
// recommended pattern (a new client per request/module exhausts DB connections).
export const prisma = new PrismaClient();
