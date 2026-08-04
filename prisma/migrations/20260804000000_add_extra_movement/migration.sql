-- AlterTable: extra fields for EXTRA budget movements (linked product + qty)
ALTER TABLE "BudgetMovement" ADD COLUMN "productId" TEXT;
ALTER TABLE "BudgetMovement" ADD COLUMN "quantity" DOUBLE PRECISION;
ALTER TABLE "BudgetMovement" ADD COLUMN "unit" TEXT;

-- AddForeignKey
ALTER TABLE "BudgetMovement" ADD CONSTRAINT "BudgetMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
