import { prisma } from "@/lib/db"
import { logError } from "@/lib/log"
import { LATEST_MIGRATION, LATEST_COLUMN_PROBE } from "@/lib/migrations-meta"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Cheap end-to-end health check. Hit `/api/health` to confirm:
 *  - The Vercel function is alive
 *  - Turso (DB) is reachable
 *  - Critical env vars are set
 *
 * No auth — this is meant for quick diagnostics during incidents AND for
 * uptime monitors. The response intentionally doesn't leak internals
 * (connection strings, etc.) and degrades gracefully: even when the DB is
 * down we still return a 200 so the monitor can read the body.
 */
export async function GET() {
  const env = {
    DATABASE_URL: !!process.env.DATABASE_URL,
    DATABASE_AUTH_TOKEN: !!process.env.DATABASE_AUTH_TOKEN,
    AUTH_SECRET: !!process.env.AUTH_SECRET,
    BLOB_READ_WRITE_TOKEN: !!process.env.BLOB_READ_WRITE_TOKEN,
    ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
    RESEND_API_KEY: !!process.env.RESEND_API_KEY,
  }

  let db: "ok" | "error" = "error"
  let dbError: string | null = null
  try {
    // Cheapest possible round-trip — no table reads, just the engine.
    await prisma.$queryRawUnsafe("SELECT 1")
    db = "ok"
  } catch (e) {
    dbError = e instanceof Error ? e.message : "unknown"
    logError("/api/health", e)
  }

  // Schema-drift detection. Deployed code expects LATEST_MIGRATION to
  // be applied; a forgotten Turso migration is the #1 historical cause
  // of prod 500s. Two probes, cheapest-first:
  //   1. _applied_migrations high-water mark (written by
  //      scripts/migrate-prod.ts) vs LATEST_MIGRATION
  //   2. pragma_table_info fallback for DBs that predate the tracking
  //      table — checks the newest migration's signature column.
  let schema: "ok" | "drift" | "unknown" = "unknown"
  let schemaDetail: string | null = null
  if (db === "ok") {
    try {
      const applied = (await prisma.$queryRawUnsafe(
        "SELECT name FROM _applied_migrations ORDER BY name DESC LIMIT 1",
      )) as Array<{ name: string }>
      const newest = applied[0]?.name ?? null
      if (newest === LATEST_MIGRATION) {
        schema = "ok"
      } else {
        schema = "drift"
        schemaDetail = `applied=${newest ?? "none"} expected=${LATEST_MIGRATION}`
      }
    } catch {
      // Tracking table missing (pre-baseline DB). Fall back to probing
      // the newest migration's column directly.
      try {
        const cols = (await prisma.$queryRawUnsafe(
          `SELECT name FROM pragma_table_info('${LATEST_COLUMN_PROBE.table}') WHERE name = '${LATEST_COLUMN_PROBE.column}'`,
        )) as Array<{ name: string }>
        if (cols.length > 0) {
          schema = "ok"
          schemaDetail = "unbaselined (run scripts/migrate-prod.ts --baseline)"
        } else {
          schema = "drift"
          schemaDetail = `missing ${LATEST_COLUMN_PROBE.table}.${LATEST_COLUMN_PROBE.column} — apply ${LATEST_MIGRATION}`
        }
      } catch (e) {
        schemaDetail = e instanceof Error ? e.message : "probe failed"
        logError("/api/health", e, { stage: "schema-probe" })
      }
    }
  }

  const overall: "ok" | "degraded" | "down" =
    db === "ok"
      ? Object.values(env).every(Boolean) && schema !== "drift"
        ? "ok"
        : "degraded"
      : "down"

  return Response.json(
    {
      ok: overall !== "down",
      status: overall,
      db,
      dbError,
      schema,
      schemaDetail,
      env,
      timestamp: new Date().toISOString(),
    },
    { status: 200 },
  )
}
