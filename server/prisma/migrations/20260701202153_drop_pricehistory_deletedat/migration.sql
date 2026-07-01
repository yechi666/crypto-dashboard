/*
  Warnings:

  - You are about to drop the column `deletedAt` on the `PriceHistory` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "PriceHistory" DROP COLUMN "deletedAt";
