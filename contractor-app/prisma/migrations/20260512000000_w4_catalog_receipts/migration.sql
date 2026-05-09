-- W4 Feature 1 — catalog-update receipts.
-- Per MIGRATIONS.md: apply both ALTERs to Turso via the dashboard SQL
-- console after this commit lands. Prisma migrate doesn't speak libsql.

ALTER TABLE "Receipt" ADD COLUMN "forCatalog" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Receipt" ADD COLUMN "catalogReviewedAt" DATETIME;
