/**
 * Seeds the test DB:
 *  1. Wipes prior fixture rows
 *  2. Creates the known test user + Auth.js session
 *  3. Creates fixture rows the tests reference (a smoke project + receipt
 *     + share token, a proposal-flow project, an expired proposal)
 *  4. Writes tests/e2e/.fixtures.json with the row IDs so spec files can
 *     read them WITHOUT importing the Prisma client themselves —
 *     Playwright's TS loader doesn't handle Prisma's CJS-style generated
 *     output, so we keep all DB access in this single tsx-run script.
 *
 * Run by tests/e2e/global-setup.ts via `npx tsx`.
 */
import { writeFileSync } from "node:fs"
import path from "node:path"
import { PrismaLibSql } from "@prisma/adapter-libsql"
import { PrismaClient } from "../../app/generated/prisma/client"

export const TEST_USER = {
  id: "test-user-id",
  email: "test@e2e.local",
  name: "E2E Test User",
} as const

export const TEST_SESSION = {
  cookieName: "authjs.session-token",
  token: "test-session-token-stable-across-runs",
} as const

const SMOKE_SHARE_TOKEN = "smoke-share-token-32chars-long-stable"
const PROPOSAL_SHARE_TOKEN = "proposal-spec-share-token-stable-32"
const EXPIRED_SHARE_TOKEN = "expired-proposal-token-32-chars-lng"

async function main() {
  const url = process.env.DATABASE_URL
  if (!url || !url.includes("test.db")) {
    throw new Error(
      `Refusing to seed: DATABASE_URL=${url} should point at file:./test.db`,
    )
  }

  const adapter = new PrismaLibSql({ url })
  const prisma = new PrismaClient({ adapter })

  // Cascade wipes everything keyed off the test user.
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
      expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  })

  // Smoke project + receipt
  const smokeProject = await prisma.project.create({
    data: {
      userId: TEST_USER.id,
      name: "Smoke test project",
      clientName: "Test Client",
      clientEmail: "client@example.com",
      address: "123 Test St",
      shareToken: SMOKE_SHARE_TOKEN,
      sections: {
        create: [
          {
            name: "Demo",
            order: 0,
            lineItems: {
              create: [
                {
                  description: "Demo wall",
                  quantity: 1,
                  unitPrice: 500,
                  unit: "ea",
                  kind: "labor",
                  order: 0,
                },
              ],
            },
          },
        ],
      },
    },
  })

  // Capture the smoke project's first service line item id so the W3.5
  // service-assignment spec can target it directly without DOM scraping.
  const smokeService = await prisma.lineItem.findFirst({
    where: { section: { projectId: smokeProject.id }, kind: "labor" },
    select: { id: true },
  })

  // Two known subs the W3.5 spec assigns to the smoke service.
  const subA = await prisma.subcontractor.create({
    data: {
      userId: TEST_USER.id,
      name: "Jose Plumbing E2E",
      contactName: "Jose",
    },
  })
  const subB = await prisma.subcontractor.create({
    data: {
      userId: TEST_USER.id,
      name: "Sparky Electric E2E",
      contactName: "Sparky",
    },
  })

  const smokeReceipt = await prisma.receipt.create({
    data: {
      userId: TEST_USER.id,
      projectId: smokeProject.id,
      imageUrl: "https://example.invalid/receipt.jpg",
      imagePathname: `receipts/${TEST_USER.id}/test.jpg`,
      filename: "test.jpg",
      size: 100_000,
      parseStatus: "pending",
    },
  })

  // Proposal-flow project (full content)
  const proposalProject = await prisma.project.create({
    data: {
      userId: TEST_USER.id,
      name: "Proposal E2E project",
      clientName: "Customer Name",
      clientEmail: "customer@example.com",
      scope: "Demo and rebuild kitchen.",
      exclusions: "Permits, dumpster fees beyond one rental.",
      paymentSchedule: "30% deposit, 40% rough-in, 30% final.",
      markupPct: 15,
      taxRate: 7,
      shareToken: PROPOSAL_SHARE_TOKEN,
      sections: {
        create: {
          name: "Demo",
          order: 0,
          lineItems: {
            create: [
              {
                description: "Demo wall",
                quantity: 1,
                unitPrice: 1000,
                unit: "ea",
                kind: "labor",
                order: 0,
              },
              {
                description: "Drywall",
                quantity: 5,
                unitPrice: 50,
                unit: "sheet",
                kind: "material",
                order: 1,
              },
            ],
          },
        },
      },
    },
  })

  // Expired proposal
  const expiredProject = await prisma.project.create({
    data: {
      userId: TEST_USER.id,
      name: "Expired E2E",
      clientName: "Old Client",
      proposalSentAt: new Date(Date.now() - 100 * 86400_000),
      validForDays: 30,
      shareToken: EXPIRED_SHARE_TOKEN,
    },
  })

  const fixtures = {
    user: TEST_USER,
    session: TEST_SESSION,
    smoke: {
      projectId: smokeProject.id,
      receiptId: smokeReceipt.id,
      shareToken: SMOKE_SHARE_TOKEN,
      serviceLineItemId: smokeService?.id ?? null,
    },
    subs: {
      a: { id: subA.id, name: subA.name },
      b: { id: subB.id, name: subB.name },
    },
    proposal: {
      projectId: proposalProject.id,
      shareToken: PROPOSAL_SHARE_TOKEN,
    },
    expired: {
      projectId: expiredProject.id,
      shareToken: EXPIRED_SHARE_TOKEN,
    },
  }

  writeFileSync(
    path.resolve(__dirname, ".fixtures.json"),
    JSON.stringify(fixtures, null, 2),
  )

  console.log(`[e2e] Seeded ${TEST_USER.email}, fixtures written to .fixtures.json`)
  await prisma.$disconnect()
}

main().catch((err) => {
  console.error("[e2e] Seed failed:", err)
  process.exit(1)
})
