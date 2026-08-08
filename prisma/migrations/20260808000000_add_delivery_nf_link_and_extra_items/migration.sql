-- Vincula DeliveryOrder a uma NF (StockEntry) de referência
ALTER TABLE "DeliveryOrder" ADD COLUMN "stockEntryId" TEXT;

-- Itens fora da NF com justificativa
ALTER TABLE "DeliveryOrderItem" ADD COLUMN "isExtra" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "DeliveryOrderItem" ADD COLUMN "extraNote" TEXT;
