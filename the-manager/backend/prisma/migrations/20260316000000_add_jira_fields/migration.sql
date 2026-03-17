-- Add JIRA integration fields to initiatives
ALTER TABLE "initiatives" ADD COLUMN "jiraTicketId" TEXT;
ALTER TABLE "initiatives" ADD COLUMN "jiraTicketUrl" TEXT;
ALTER TABLE "initiatives" ADD COLUMN "jiraTicketData" TEXT;
