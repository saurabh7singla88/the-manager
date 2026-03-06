-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatar" TEXT,
    "role" TEXT NOT NULL DEFAULT 'MANAGER',
    "preferences" TEXT,
    "hasPassword" BOOLEAN NOT NULL DEFAULT true,
    "notesPasswordHash" TEXT,
    "resetToken" TEXT,
    "resetTokenExpiry" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "lastLogin" DATETIME
);

-- CreateTable
CREATE TABLE "initiatives" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'INITIATIVE',
    "parentId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "startDate" DATETIME,
    "dueDate" DATETIME,
    "completedAt" DATETIME,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "isStandaloneTask" BOOLEAN NOT NULL DEFAULT false,
    "linkedInitiativeId" TEXT,
    "canvasId" TEXT,
    "positionX" REAL,
    "positionY" REAL,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "initiatives_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "initiatives" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "initiatives_linkedInitiativeId_fkey" FOREIGN KEY ("linkedInitiativeId") REFERENCES "initiatives" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "initiatives_canvasId_fkey" FOREIGN KEY ("canvasId") REFERENCES "canvases" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "initiatives_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "links" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "url" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "category" TEXT,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "initiativeId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "links_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "initiatives" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "links_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "comments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "content" TEXT NOT NULL,
    "initiativeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "comments_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "initiatives" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "comments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "activity_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "action" TEXT NOT NULL,
    "changes" TEXT,
    "initiativeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "activity_logs_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "initiatives" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "activity_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "canvases" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT NOT NULL DEFAULT '#6366f1',
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "canvases_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "brainstorm_canvases" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nodes" TEXT NOT NULL DEFAULT '[]',
    "edges" TEXT NOT NULL DEFAULT '[]',
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "brainstorm_canvases_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "notes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "isProtected" BOOLEAN NOT NULL DEFAULT false,
    "passwordHash" TEXT,
    "canvasId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "notes_canvasId_fkey" FOREIGN KEY ("canvasId") REFERENCES "canvases" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "notes_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "_InitiativeAssignees" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_InitiativeAssignees_A_fkey" FOREIGN KEY ("A") REFERENCES "initiatives" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_InitiativeAssignees_B_fkey" FOREIGN KEY ("B") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "initiatives_parentId_idx" ON "initiatives"("parentId");

-- CreateIndex
CREATE INDEX "initiatives_status_idx" ON "initiatives"("status");

-- CreateIndex
CREATE INDEX "initiatives_priority_idx" ON "initiatives"("priority");

-- CreateIndex
CREATE INDEX "initiatives_createdById_idx" ON "initiatives"("createdById");

-- CreateIndex
CREATE INDEX "initiatives_canvasId_idx" ON "initiatives"("canvasId");

-- CreateIndex
CREATE INDEX "links_initiativeId_idx" ON "links"("initiativeId");

-- CreateIndex
CREATE INDEX "comments_initiativeId_idx" ON "comments"("initiativeId");

-- CreateIndex
CREATE INDEX "activity_logs_initiativeId_idx" ON "activity_logs"("initiativeId");

-- CreateIndex
CREATE INDEX "activity_logs_timestamp_idx" ON "activity_logs"("timestamp");

-- CreateIndex
CREATE INDEX "canvases_createdById_idx" ON "canvases"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "brainstorm_canvases_userId_key" ON "brainstorm_canvases"("userId");

-- CreateIndex
CREATE INDEX "notes_createdById_idx" ON "notes"("createdById");

-- CreateIndex
CREATE INDEX "notes_canvasId_idx" ON "notes"("canvasId");

-- CreateIndex
CREATE UNIQUE INDEX "_InitiativeAssignees_AB_unique" ON "_InitiativeAssignees"("A", "B");

-- CreateIndex
CREATE INDEX "_InitiativeAssignees_B_index" ON "_InitiativeAssignees"("B");
