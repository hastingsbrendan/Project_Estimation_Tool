# Migrations runbook

## TL;DR (UPDATED — now automated via CI)

Migrations to Turso are applied automatically by GitHub Actions on every
push to `main`: `.github/workflows/ci.yml` runs
`scripts/migrate-prod.ts`, which tracks applied migrations in an
`_applied_migrations` table on Turso and applies anything new — AFTER
the unit + E2E suites pass.

**One-time setup (required before the automation works):**

1. Add repo secrets on GitHub (Settings → Secrets and variables → Actions):
   - `TURSO_DATABASE_URL` — the `libsql://…` URL
   - `TURSO_AUTH_TOKEN` — a Turso auth token
2. Baseline the existing prod DB (records the already-hand-applied
   migrations without re-running them):

   ```bash
   DATABASE_URL=libsql://... DATABASE_AUTH_TOKEN=... \
     npx tsx scripts/migrate-prod.ts --baseline
   ```

Until both steps are done, the CI migrate job logs a warning and skips —
and you're back on the manual flow below.

**Drift detection:** `/api/health` now reports `schema: "ok" | "drift"`,
comparing the DB's applied-migrations high-water mark (or, pre-baseline,
a probe of the newest migration's column) against
`lib/migrations-meta.ts:LATEST_MIGRATION`. Point an uptime monitor at it
(see TRIAGE.md) and a forgotten migration emails you instead of 500ing
users. When adding a migration, bump `LATEST_MIGRATION` — a unit test
fails if you forget.

## Local flow

```bash
# 1. Edit prisma/schema.prisma
# 2. Generate a migration name + SQL
npx prisma migrate dev --name <description>

# 3. Apply to local dev.db (the migrate dev command above does this)
# 4. Update LATEST_MIGRATION in lib/migrations-meta.ts
# 5. Sanity-test the change locally (npm run dev)
```

## Manual production flow (fallback when CI secrets aren't set)

After committing the migration, BEFORE the next `git push`:

```bash
# Open Turso shell (either CLI or dashboard SQL console)
turso db shell <db-name>

# Paste the contents of the new migration's migration.sql
# (one ALTER/CREATE per line; semicolon-terminated)
```

Or via the dashboard at https://app.turso.tech → database → SQL console →
paste the statements → run. If the DB has been baselined, also record it:

```sql
INSERT INTO _applied_migrations (name, applied_at)
VALUES ('<migration_dir_name>', datetime('now'));
```

## Verifying the schemas match

```bash
# Quickest: hit /api/health and read the `schema` field.

# Local
sqlite3 prisma/dev.db ".schema Project"

# Turso (CLI)
turso db shell <db-name> ".schema Project"
```

## When you forget

You'll see "This page couldn't load. A server error occurred." on every
page that touches the changed table. `/api/health` will say
`schema: "drift"` with the missing migration's name. Apply it (CI re-run
or manual paste) — the next request fixes itself, no redeploy needed.
