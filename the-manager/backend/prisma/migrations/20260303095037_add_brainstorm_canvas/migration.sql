-- CreateTable
CREATE TABLE "brainstorm_canvases" (
    "id" TEXT NOT NULL,
    "nodes" JSONB NOT NULL DEFAULT '[]',
    "edges" JSONB NOT NULL DEFAULT '[]',
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brainstorm_canvases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "brainstorm_canvases_userId_key" ON "brainstorm_canvases"("userId");

-- AddForeignKey
ALTER TABLE "brainstorm_canvases" ADD CONSTRAINT "brainstorm_canvases_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
