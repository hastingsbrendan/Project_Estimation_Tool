/**
 * Seeds the test DB with a known user + session row so tests can simulate
 * a logged-in browser by injecting the session cookie. Run by
 * tests/e2e/global-setup.ts via tsx.
 *
 * Idempotent: re-running upserts the same user.
 */
import { PrismaLibSql } from "@prisma/adapter-libsql"
import { PrismaClient } from "../../app/generated/prisma/client"

export const TEST_USER = {
  id: "test-user-id",
  email: "test@e2e.local",
  name: "E2E Test User",
} as const

export const TEST_SESSION = {
  // Auth.js v5 default cookie name (no __Secure- prefix because tests run on http://)
  cookieName: "authjs.session-token",
  // Long-lived stable token for tests
  token: "test-session-token-stable-across-runs",
} as const

async function main() {
  const url = process.env.DATABASE_URL
  if (!url || !url.includes("test.db")) {
    throw new Error(
      `Refusing to seed: DATABASE_URL=${url} should point at file:./test.db`,
    )
  }

  const adapter = new PrismaLibSql({ url })
  const prisma = new PrismaClient({ adapter })

  // Wipe the user (cascade clears Sessions + Projects + Catalog + Receipts).
  await prisma.user.deleteMany({ where: { id: TEST_USER.id } })

  await prisma.user.create({
    data: {
      id: TEST_USER.id,
      email: TEST_USER.email,
      name: TEST_USER.name,
      emailVerified: new Date(),
    },
  })

  await prisma.session.create({
    data: {
      sessionToken: TEST_SESSION.token,
      userId: TEST_USER.id,
      expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // +7 days
    },
  })

  console.log(`[e2e] Seeded user ${TEST_USER.email} with session token`)
  await prisma.$disconnect()
}

main().catch((err) => {
  console.error("[e2e] Seed failed:", err)
  process.exit(1)
})
