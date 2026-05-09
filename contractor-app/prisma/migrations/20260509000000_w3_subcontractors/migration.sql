-- W3: Subcontractor management. 5 new tables + a self-referencing many-to-many
-- through SubcontractorSpecialty. Tax IDs are encrypted at rest via aes-256-gcm
-- using SUBCONTRACTOR_PII_KEY (lib/crypto/secret-box.ts).
--
-- Reminder: Turso doesn't run prisma migrate deploy automatically. After this
-- ships, apply each statement via the Turso dashboard SQL console or
-- `turso db shell <db>`. See MIGRATIONS.md.

CREATE TABLE "Subcontractor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "taxIdEncrypted" TEXT,
    "taxIdLast4" TEXT,
    "isCorporation" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Subcontractor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "Subcontractor_userId_idx" ON "Subcontractor"("userId");
CREATE INDEX "Subcontractor_archived_idx" ON "Subcontractor"("archived");

CREATE TABLE "Specialty" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "userId" TEXT,
    CONSTRAINT "Specialty_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Specialty_slug_key" ON "Specialty"("slug");
CREATE INDEX "Specialty_userId_idx" ON "Specialty"("userId");

CREATE TABLE "SubcontractorSpecialty" (
    "subcontractorId" TEXT NOT NULL,
    "specialtyId" TEXT NOT NULL,
    PRIMARY KEY ("subcontractorId", "specialtyId"),
    CONSTRAINT "SubcontractorSpecialty_subcontractorId_fkey" FOREIGN KEY ("subcontractorId") REFERENCES "Subcontractor" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SubcontractorSpecialty_specialtyId_fkey" FOREIGN KEY ("specialtyId") REFERENCES "Specialty" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "SubcontractorSpecialty_specialtyId_idx" ON "SubcontractorSpecialty"("specialtyId");

CREATE TABLE "ProjectSubcontractor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "subcontractorId" TEXT NOT NULL,
    "scope" TEXT,
    "agreedAmount" REAL,
    "hourlyRate" REAL,
    "startDate" DATETIME,
    "endDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'invited',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProjectSubcontractor_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProjectSubcontractor_subcontractorId_fkey" FOREIGN KEY ("subcontractorId") REFERENCES "Subcontractor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ProjectSubcontractor_projectId_subcontractorId_key" ON "ProjectSubcontractor"("projectId", "subcontractorId");
CREATE INDEX "ProjectSubcontractor_projectId_idx" ON "ProjectSubcontractor"("projectId");
CREATE INDEX "ProjectSubcontractor_subcontractorId_idx" ON "ProjectSubcontractor"("subcontractorId");

CREATE TABLE "SubcontractorPayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subcontractorId" TEXT NOT NULL,
    "projectId" TEXT,
    "amount" REAL NOT NULL,
    "paidAt" DATETIME NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'check',
    "reference" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SubcontractorPayment_subcontractorId_fkey" FOREIGN KEY ("subcontractorId") REFERENCES "Subcontractor" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SubcontractorPayment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "SubcontractorPayment_subcontractorId_idx" ON "SubcontractorPayment"("subcontractorId");
CREATE INDEX "SubcontractorPayment_projectId_idx" ON "SubcontractorPayment"("projectId");
CREATE INDEX "SubcontractorPayment_paidAt_idx" ON "SubcontractorPayment"("paidAt");

CREATE TABLE "SubcontractorRating" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subcontractorId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "qualityStars" INTEGER NOT NULL,
    "timelinessStars" INTEGER NOT NULL,
    "communicationStars" INTEGER NOT NULL,
    "overallStars" INTEGER NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SubcontractorRating_subcontractorId_fkey" FOREIGN KEY ("subcontractorId") REFERENCES "Subcontractor" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SubcontractorRating_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SubcontractorRating_projectId_subcontractorId_key" ON "SubcontractorRating"("projectId", "subcontractorId");
CREATE INDEX "SubcontractorRating_subcontractorId_idx" ON "SubcontractorRating"("subcontractorId");
