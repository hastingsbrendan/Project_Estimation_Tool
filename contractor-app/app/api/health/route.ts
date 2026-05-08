import { prisma } from "@/lib/db"
import { logError } from "@/lib/log"

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

  const overall: "ok" | "degraded" | "down" =
    db === "ok"
      ? Object.values(env).every(Boolean)
        ? "ok"
        : "degraded"
      : "down"

  return Response.json(
    {
      ok: overall !== "down",
      status: overall,
      db,
      dbError,
      env,
      timestamp: new Date().toISOString(),
    },
    { status: 200 },
  )
}
