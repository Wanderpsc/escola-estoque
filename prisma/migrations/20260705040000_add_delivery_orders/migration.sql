-- AlterTable: adicionar supplierId ao User
ALTER TABLE "User" ADD COLUMN "supplierId" TEXT;

ALTER TABLE "User" ADD CONSTRAINT "User_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: DeliveryOrder
CREATE TABLE "DeliveryOrder" (
    "id"            TEXT NOT NULL,
    "supplierId"    TEXT NOT NULL,
    "schoolId"      TEXT NOT NULL,
    "programId"     TEXT,
    "createdById"   TEXT NOT NULL,
    "status"        TEXT NOT NULL DEFAULT 'PENDING',
    "deliveryDate"  TIMESTAMP(3) NOT NULL,
    "notes"         TEXT,
    "confirmedById" TEXT,
    "confirmedAt"   TIMESTAMP(3),
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable: DeliveryOrderItem
CREATE TABLE "DeliveryOrderItem" (
    "id"                TEXT NOT NULL,
    "orderId"           TEXT NOT NULL,
    "productId"         TEXT NOT NULL,
    "quantityOrdered"   DOUBLE PRECISION NOT NULL,
    "quantityDelivered" DOUBLE PRECISION,
    "unitPrice"         DOUBLE PRECISION NOT NULL,
    "totalPrice"        DOUBLE PRECISION NOT NULL,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryOrderItem_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey: DeliveryOrder
ALTER TABLE "DeliveryOrder" ADD CONSTRAINT "DeliveryOrder_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DeliveryOrder" ADD CONSTRAINT "DeliveryOrder_schoolId_fkey"
  FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DeliveryOrder" ADD CONSTRAINT "DeliveryOrder_programId_fkey"
  FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DeliveryOrder" ADD CONSTRAINT "DeliveryOrder_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DeliveryOrder" ADD CONSTRAINT "DeliveryOrder_confirmedById_fkey"
  FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: DeliveryOrderItem
ALTER TABLE "DeliveryOrderItem" ADD CONSTRAINT "DeliveryOrderItem_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "DeliveryOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DeliveryOrderItem" ADD CONSTRAINT "DeliveryOrderItem_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
