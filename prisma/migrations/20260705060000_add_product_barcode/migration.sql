-- AlterTable: adicionar campo barcode ao Product (EAN-13, EAN-8, Code-128, etc.)
ALTER TABLE "Product" ADD COLUMN "barcode" TEXT;
