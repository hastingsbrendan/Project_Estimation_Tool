-- Repair: Project.archived has been in schema.prisma since W2 but no
-- migration ever added it. The column got applied to dev / Turso at some
-- point via `prisma db push` (or hand SQL), but a fresh DB built from
-- migrations alone is missing it — surfaced by the new e2e test
-- infrastructure trying to seed a project on a clean test.db.
--
-- Use ALTER TABLE ADD COLUMN. Idempotency note: SQLite has no IF NOT
-- EXISTS for ADD COLUMN. Production Turso already has this column —
-- DO NOT apply this SQL there. The migrations table will track that
-- this migration has already been run on Turso (mark it applied via
-- `_prisma_migrations` table, see MIGRATIONS.md).

ALTER TABLE "Project" ADD COLUMN "archived" BOOLEAN NOT NULL DEFAULT false;
