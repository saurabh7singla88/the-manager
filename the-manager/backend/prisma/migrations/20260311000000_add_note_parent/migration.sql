-- AlterTable: add parentId to notes for n-level hierarchy
ALTER TABLE "notes" ADD COLUMN "parentId" TEXT REFERENCES "notes"("id") ON DELETE CASCADE;

-- CreateIndex
CREATE INDEX "notes_parentId_idx" ON "notes"("parentId");
