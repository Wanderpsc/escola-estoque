-- Finalização de NF pelo administrador
ALTER TABLE "StockEntry" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'OPEN';
ALTER TABLE "StockEntry" ADD COLUMN "finalizedAt" TIMESTAMP(3);
