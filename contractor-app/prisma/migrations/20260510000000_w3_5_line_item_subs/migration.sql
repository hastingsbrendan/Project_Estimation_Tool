-- W3.5: Granular line-item ↔ subcontractor assignments + service completion.
-- Per MIGRATIONS.md, apply each statement to Turso via the dashboard SQL
-- console after this commit lands; Prisma migrate doesn't speak libsql.

ALTER TABLE "LineItem" ADD COLUMN "completedAt" DATETIME;

CREATE TABLE "LineItemSubcontractor" (
    "lineItemId" TEXT NOT NULL,
    "subcontractorId" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("lineItemId", "subcontractorId"),
    CONSTRAINT "LineItemSubcontractor_lineItemId_fkey" FOREIGN KEY ("lineItemId") REFERENCES "LineItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LineItemSubcontractor_subcontractorId_fkey" FOREIGN KEY ("subcontractorId") REFERENCES "Subcontractor" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "LineItemSubcontractor_subcontractorId_idx" ON "LineItemSubcontractor"("subcontractorId");
