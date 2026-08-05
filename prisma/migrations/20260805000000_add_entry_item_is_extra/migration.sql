-- AlterTable EntryItem: flag for products delivered outside the official NF
ALTER TABLE "EntryItem" ADD COLUMN "isExtra" BOOLEAN NOT NULL DEFAULT FALSE;
