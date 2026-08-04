-- AlterTable School: custom PDF header and logo (base64 or URL)
ALTER TABLE "School" ADD COLUMN "logoUrl" TEXT;
ALTER TABLE "School" ADD COLUMN "customHeader" TEXT;
