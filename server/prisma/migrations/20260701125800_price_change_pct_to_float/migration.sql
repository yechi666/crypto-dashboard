/*
  Warnings:

  - You are about to alter the column `priceChangePercentage24h` on the `Coin` table. The data in that column could be lost. The data in that column will be cast from `Decimal(10,4)` to `DoublePrecision`.

*/
-- AlterTable
ALTER TABLE "Coin" ALTER COLUMN "priceChangePercentage24h" SET DATA TYPE DOUBLE PRECISION;
