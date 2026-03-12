-- CreateTable: meeting_notes — stores saved email meeting notes, optionally linked to an initiative
CREATE TABLE "meeting_notes" (
    "id"           TEXT     NOT NULL PRIMARY KEY,
    "subject"      TEXT     NOT NULL,
    "fromEmail"    TEXT,
    "date"         DATETIME,
    "body"         TEXT     NOT NULL DEFAULT '',
    "initiativeId" TEXT     REFERENCES "initiatives"("id") ON DELETE SET NULL,
    "createdById"  TEXT     NOT NULL REFERENCES "users"("id"),
    "createdAt"    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "meeting_notes_initiativeId_idx" ON "meeting_notes"("initiativeId");
CREATE INDEX "meeting_notes_createdById_idx"  ON "meeting_notes"("createdById");
