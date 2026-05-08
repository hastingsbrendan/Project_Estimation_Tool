# Migrations runbook

## TL;DR

When you change `prisma/schema.prisma`, you MUST manually apply the migration
to Turso (production). `prisma migrate deploy` does not speak `libsql://`,
so it can't do it for you. Vercel deploys do not run migrations either.

Forgetting this → the next deploy 500s every page that reads the changed
table, because Prisma generates `SELECT col_a, col_b, col_c` from the new
schema and Turso doesn't have those columns yet.

## Local flow

```bash
# 1. Edit prisma/schema.prisma
# 2. Generate a migration name + SQL
npx prisma migrate dev --name <description>

# 3. Apply to local dev.db (the migrate dev command above does this)
# 4. Sanity-test the change locally (npm run dev)
```

## Production flow (Turso)

After committing the migration, BEFORE the next `git push`:

```bash
# Open Turso shell (either CLI or dashboard SQL console)
turso db shell <db-name>

# Paste the contents of the new migration's migration.sql
# (one ALTER/CREATE per line; semicolon-terminated)
```

Or via the dashboard at https://app.turso.tech → database → SQL console →
paste the statements → run.

## Verifying the schemas match

```bash
# Local
sqlite3 prisma/dev.db ".schema Project"

# Turso (CLI)
turso db shell <db-name> ".schema Project"
```

The output should be identical (modulo INDEX statements that may have run
in a different order).

## When you forget

You'll see "This page couldn't load. A server error occurred." on every
page that touches the changed table, with an ERROR id at the bottom. Apply
the missing migration to Turso — the next request fixes itself, no
redeploy needed.

## Why not automate this?

Could put `prisma migrate deploy` in `vercel-build`, but it doesn't
support `libsql://`. The Prisma + Turso integration is via the runtime
`@prisma/adapter-libsql` only. Real fixes for the future:

1. Migrate to Atlas, which speaks libsql via the same adapter.
2. Add a deploy step that calls `turso db shell ... < migration.sql` for
   each unapplied migration. Needs `TURSO_AUTH_TOKEN` in Vercel build env
   and tracking what's already applied.

For now — manual, with this runbook.
