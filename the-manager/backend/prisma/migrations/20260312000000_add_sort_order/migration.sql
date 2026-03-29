-- AlterTable: add sortOrder column with default 0
ALTER TABLE "initiatives" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "initiatives_sortOrder_idx" ON "initiatives"("sortOrder");
