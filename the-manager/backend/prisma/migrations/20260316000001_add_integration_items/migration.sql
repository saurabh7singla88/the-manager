-- CreateTable
CREATE TABLE "integration_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "key" TEXT,
    "url" TEXT NOT NULL,
    "title" TEXT,
    "cachedData" TEXT,
    "initiativeId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "integration_items_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "initiatives" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "integration_items_initiativeId_idx" ON "integration_items"("initiativeId");

-- Migrate existing single-field JIRA data into the new integration_items table
INSERT INTO "integration_items" ("id", "type", "key", "url", "title", "cachedData", "initiativeId", "createdAt", "updatedAt")
SELECT lower(hex(randomblob(16))), 'JIRA', "jiraTicketId", COALESCE("jiraTicketUrl", ''), "jiraTicketId", "jiraTicketData", "id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "initiatives"
WHERE "jiraTicketId" IS NOT NULL;

-- Drop old single-ticket JIRA columns from initiatives
ALTER TABLE "initiatives" DROP COLUMN "jiraTicketId";
ALTER TABLE "initiatives" DROP COLUMN "jiraTicketUrl";
ALTER TABLE "initiatives" DROP COLUMN "jiraTicketData";

