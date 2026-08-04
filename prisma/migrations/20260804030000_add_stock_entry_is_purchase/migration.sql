-- AlterTable StockEntry: flag for informal purchases (no formal NF)
ALTER TABLE "StockEntry" ADD COLUMN "isPurchase" BOOLEAN NOT NULL DEFAULT FALSE;
