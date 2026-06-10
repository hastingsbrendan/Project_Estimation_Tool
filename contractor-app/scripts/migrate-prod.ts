/**
 * Apply pending Prisma migrations to Turso (libsql) — the piece
 * `prisma migrate deploy` can't do because it doesn't speak libsql://.
 *
 * Tracks applied migrations in a `_applied_migrations` table on the
 * target DB. Each run:
 *   1. Reads prisma/migrations/<name>/migration.sql from disk (sorted)
 *   2. Applies any whose name isn't in _applied_migrations
 *   3. Records them
 *
 * SAFETY — first run against an existing prod DB:
 * The prod database already had ~13 migrations applied by hand before
 * this script existed. Re-running those would fail (duplicate tables /
 * columns). So if `_applied_migrations` doesn't exist but the DB is
 * clearly not empty (User table present), the script REFUSES to run
 * unless invoked with `--baseline`, which records every current
 * migration as applied WITHOUT executing anything. Run once:
 *
 *   DATABASE_URL=libsql://... DATABASE_AUTH_TOKEN=... \
 *     npx tsx scripts/migrate-prod.ts --baseline
 *
 * After that, CI runs the plain form on every push to main:
 *
 *   npx tsx scripts/migrate-prod.ts
 *
 * Local test DBs (file:./test.db) are handled by `prisma migrate` in the
 * normal flow — this script is for the libsql:// prod target. It will
 * still work against file: URLs, which is how the unit-of-work gets
 * exercised in CI before touching prod.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs"
import path from "node:path"
import { createClient } from "@libsql/client"

const MIGRATIONS_DIR = path.resolve(__dirname, "..", "prisma", "migrations")

function listMigrations(): { name: string; sql: string }[] {
  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort() // names are timestamp-prefixed, lexicographic == chronological
    .map((name) => {
      const file = path.join(MIGRATIONS_DIR, name, "migration.sql")
      if (!existsSync(file)) {
        throw new Error(`Migration dir ${name} has no migration.sql`)
      }
      return { name, sql: readFileSync(file, "utf8") }
    })
}

/**
 * Split a Prisma-generated SQLite migration into individual statements.
 * Prisma emits simple `;`-terminated DDL — no triggers, no procedures —
 * so splitting on semicolon-at-end-of-statement is safe here. Comments
 * (`-- ...`) are preserved inside statements and stripped when a chunk
 * is comment-only.
 */
function splitStatements(sql: string): string[] {
  return sql
    .split(/;\s*(?:\r?\n|$)/)
    .map((s) => s.trim())
    .filter((s) => {
      if (!s) return false
      // Drop chunks that are only comments/whitespace
      const meaningful = s
        .split(/\r?\n/)
        .some((line) => line.trim() && !line.trim().startsWith("--"))
      return meaningful
    })
}

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error("DATABASE_URL is not set")
    process.exit(2)
  }
  const baseline = process.argv.includes("--baseline")
  const client = createClient({
    url,
    authToken: process.env.DATABASE_AUTH_TOKEN,
  })

  const migrations = listMigrations()
  console.log(`[migrate] ${migrations.length} migrations on disk; target: ${url.replace(/\/\/.*@/, "//***@")}`)

  // Does the tracking table exist?
  const trackingExists =
    (
      await client.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='_applied_migrations'",
      )
    ).rows.length > 0

  if (!trackingExists) {
    const dbHasTables =
      (
        await client.execute(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='User'",
        )
      ).rows.length > 0
    if (dbHasTables && !baseline) {
      console.error(
        "[migrate] REFUSING: this DB has tables but no _applied_migrations " +
          "tracking. If its schema is already current, run once with " +
          "--baseline to record existing migrations without executing them.",
      )
      process.exit(1)
    }
    await client.execute(
      "CREATE TABLE IF NOT EXISTS _applied_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)",
    )
  }

  const appliedRows = await client.execute("SELECT name FROM _applied_migrations")
  const applied = new Set(appliedRows.rows.map((r) => String(r.name)))

  let ran = 0
  for (const m of migrations) {
    if (applied.has(m.name)) continue

    if (baseline) {
      await client.execute({
        sql: "INSERT INTO _applied_migrations (name, applied_at) VALUES (?, ?)",
        args: [m.name, new Date().toISOString()],
      })
      console.log(`[migrate] baselined ${m.name} (recorded, not executed)`)
      ran++
      continue
    }

    console.log(`[migrate] applying ${m.name}…`)
    const statements = splitStatements(m.sql)
    try {
      // libsql batch runs in a single implicit transaction.
      await client.batch(
        statements.map((sql) => ({ sql, args: [] })),
        "write",
      )
      await client.execute({
        sql: "INSERT INTO _applied_migrations (name, applied_at) VALUES (?, ?)",
        args: [m.name, new Date().toISOString()],
      })
      ran++
    } catch (e) {
      console.error(`[migrate] FAILED on ${m.name}:`, e)
      console.error(
        "[migrate] Nothing after this migration was applied. Fix the SQL " +
          "(or apply by hand + INSERT its name into _applied_migrations) and re-run.",
      )
      process.exit(1)
    }
  }

  console.log(
    ran === 0
      ? "[migrate] Nothing to do — schema is current."
      : `[migrate] Done — ${ran} migration(s) ${baseline ? "baselined" : "applied"}.`,
  )
  client.close()
}

main().catch((e) => {
  console.error("[migrate] Unexpected failure:", e)
  process.exit(1)
})
