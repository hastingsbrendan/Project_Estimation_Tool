-- Add free-form fields to Project for notes + proposal builder
ALTER TABLE "Project" ADD COLUMN "notes" TEXT;
ALTER TABLE "Project" ADD COLUMN "scope" TEXT;
ALTER TABLE "Project" ADD COLUMN "exclusions" TEXT;
ALTER TABLE "Project" ADD COLUMN "paymentSchedule" TEXT;
ALTER TABLE "Project" ADD COLUMN "proposalSentAt" DATETIME;
ALTER TABLE "Project" ADD COLUMN "shareToken" TEXT;
CREATE UNIQUE INDEX "Project_shareToken_key" ON "Project"("shareToken");

-- Photos linked to a project (Vercel Blob URLs)
CREATE TABLE "Photo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "url" TEXT NOT NULL,
    "pathname" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "caption" TEXT,
    "size" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "order" INTEGER NOT NULL DEFAULT 0,
    "projectId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Photo_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "Photo_projectId_idx" ON "Photo"("projectId");
