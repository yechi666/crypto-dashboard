/*
  Warnings:

  - You are about to drop the column `success` on the `FetchLog` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "FetchStatus" AS ENUM ('PROCESSING', 'SUCCEEDED', 'FAILED');

-- AlterTable
ALTER TABLE "FetchLog" DROP COLUMN "success",
ADD COLUMN     "status" "FetchStatus" NOT NULL DEFAULT 'PROCESSING';

-- AlterTable
ALTER TABLE "PriceHistory" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "FetchLog_status_startedAt_idx" ON "FetchLog"("status", "startedAt");
