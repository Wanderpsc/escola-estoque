-- AlterTable: adicionar parentId ao Program (auto-relação para subdivisões/parcelas)
ALTER TABLE "Program" ADD COLUMN "parentId" TEXT;

ALTER TABLE "Program" ADD CONSTRAINT "Program_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "Program"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: adicionar category ao BudgetMovement (NORMAL | SALDO_ANTERIOR | DIVIDA)
ALTER TABLE "BudgetMovement" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'NORMAL';
