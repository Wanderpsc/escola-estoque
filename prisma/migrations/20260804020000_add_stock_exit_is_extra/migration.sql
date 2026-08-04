-- AlterTable StockExit: flag for products not registered via invoice
ALTER TABLE "StockExit" ADD COLUMN "isExtra" BOOLEAN NOT NULL DEFAULT FALSE;
