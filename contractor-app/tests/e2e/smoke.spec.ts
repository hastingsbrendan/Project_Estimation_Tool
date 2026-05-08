import { test, expect } from "@playwright/test"
import { loginAsTestUser } from "./auth-helpers"
import { PrismaLibSql } from "@prisma/adapter-libsql"
import { PrismaClient } from "../../app/generated/prisma/client"
import { TEST_USER } from "./seed-user"

/**
 * SMOKE TEST — visit every page that ships and assert it returns a 2xx,
 * not a 500. This is the test that catches the entire class of "bug only
 * shows up in prod builds" issues — like today's
 *
 *   Error: Event handlers cannot be passed to Client Component props.
 *
 * which crashed every receipt detail page render in production but ran
 * fine in dev.
 *
 * If a page needs data (a project ID, a receipt ID, a share token), this
 * test creates the rows up-front via direct prisma access against the
 * test DB. We're not exercising the create flow here — that's
 * projects.spec.ts and receipts.spec.ts. We just need real IDs to plug
 * into the URLs so the routes actually render the data path.
 */

let projectId: string
let receiptId: string
let shareToken: string

test.beforeAll(async () => {
  const prisma = new PrismaClient({
    adapter: new PrismaLibSql({ url: "file:./test.db" }),
  })

  // Wipe any rows left from prior runs so this is deterministic.
  await prisma.receipt.deleteMany({ where: { userId: TEST_USER.id } })
  await prisma.project.deleteMany({ where: { userId: TEST_USER.id } })

  const project = await prisma.project.create({
    data: {
      userId: TEST_USER.id,
      name: "Smoke test project",
      clientName: "Test Client",
      clientEmail: "client@example.com",
      address: "123 Test St",
      shareToken: "smoke-share-token-32chars-long-stable",
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
  projectId = project.id
  shareToken = project.shareToken!

  const receipt = await prisma.receipt.create({
    data: {
      userId: TEST_USER.id,
      projectId: project.id,
      imageUrl: "https://example.invalid/receipt.jpg",
      imagePathname: `receipts/${TEST_USER.id}/test.jpg`,
      filename: "test.jpg",
      size: 100_000,
      parseStatus: "pending",
    },
  })
  receiptId = receipt.id

  await prisma.$disconnect()
})

test.describe("smoke: authed pages", () => {
  test.beforeEach(async ({ context }) => {
    await loginAsTestUser(context)
  })

  // The list of every authed route in the app. Add a new entry whenever
  // a new page lands. Keep the comments — they're what the QA agent
  // reads to understand intent.
  const pages = [
    { name: "projects list", path: () => "/projects" },
    { name: "new project form", path: () => "/projects/new" },
    { name: "project detail", path: () => `/projects/${projectId}` },
    { name: "project proposal editor", path: () => `/projects/${projectId}/proposal` },
    { name: "project materials list", path: () => `/projects/${projectId}/materials` },
    { name: "receipts list", path: () => "/receipts" },
    { name: "receipt detail", path: () => `/receipts/${receiptId}` },
    { name: "services catalog", path: () => "/catalog/services" },
    { name: "materials catalog", path: () => "/catalog/materials" },
  ]

  for (const p of pages) {
    test(`renders ${p.name}`, async ({ page }) => {
      const response = await page.goto(p.path())
      expect(response?.status(), `${p.path()} returned non-2xx`).toBeLessThan(400)
      // Every page should have the contractor-app header. If it's the
      // dark "This page couldn't load" boundary, the header is absent.
      const errorBoundary = page.locator("text=/Something (went wrong|broke on this page)/i")
      await expect(errorBoundary, `${p.path()} rendered the error boundary`).toHaveCount(0)
    })
  }
})

test.describe("smoke: public pages", () => {
  test("login page renders", async ({ page }) => {
    const response = await page.goto("/login")
    expect(response?.status()).toBeLessThan(400)
  })

  test("public proposal page renders for valid share token", async ({ page }) => {
    const response = await page.goto(`/proposal/${shareToken}`)
    expect(response?.status()).toBeLessThan(400)
    await expect(page.getByText(/PROPOSAL/i)).toBeVisible()
  })

  test("public proposal page 404s for invalid token", async ({ page }) => {
    const response = await page.goto("/proposal/this-is-not-a-real-token-zzzzzzzz")
    expect([404]).toContain(response?.status())
  })

  test("/api/health returns ok", async ({ request }) => {
    const response = await request.get("/api/health")
    expect(response.status()).toBe(200)
    const body = await response.json()
    expect(body.ok).toBe(true)
    expect(body.db).toBe("ok")
  })
})
