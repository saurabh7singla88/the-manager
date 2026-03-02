-- AlterTable
ALTER TABLE "initiatives" ADD COLUMN     "isStandaloneTask" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "linkedInitiativeId" TEXT;

-- AddForeignKey
ALTER TABLE "initiatives" ADD CONSTRAINT "initiatives_linkedInitiativeId_fkey" FOREIGN KEY ("linkedInitiativeId") REFERENCES "initiatives"("id") ON DELETE SET NULL ON UPDATE CASCADE;
