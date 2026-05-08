import { test, expect } from "@playwright/test"
import { loginAsTestUser } from "./auth-helpers"
import { PrismaLibSql } from "@prisma/adapter-libsql"
import { PrismaClient } from "../../app/generated/prisma/client"
import { TEST_USER } from "./seed-user"

/**
 * Proposal lifecycle:
 *   - Contractor edits the proposal content (scope, exclusions, etc.)
 *   - Generates a public share link
 *   - Customer (anonymous) opens the share link in a fresh context
 *   - Customer signs (types name + checks consent)
 *   - Contractor sees the signed receipt in their view
 *
 * Today's W2.9 work also added valid-until + estStartWindow + estDuration
 * + a "void acceptance" button that crashed in prod (the bug we fixed in
 * c7f4110). All of that is exercised here.
 */
test.describe("proposal lifecycle", () => {
  let projectId: string
  let shareToken: string

  test.beforeAll(async () => {
    const prisma = new PrismaClient({
      adapter: new PrismaLibSql({ url: "file:./test.db" }),
    })
    // Fresh project so other tests don't interfere.
    const project = await prisma.project.create({
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
    projectId = project.id

    // Generate a stable share token directly.
    shareToken = "proposal-spec-share-token-stable-32"
    await prisma.project.update({
      where: { id: project.id },
      data: { shareToken },
    })

    await prisma.$disconnect()
  })

  test("contractor proposal editor renders with all sections", async ({
    context,
    page,
  }) => {
    await loginAsTestUser(context)
    await page.goto(`/projects/${projectId}/proposal`)

    await expect(page.getByText(/Scope of work/i)).toBeVisible()
    await expect(page.getByText(/Exclusions/i)).toBeVisible()
    await expect(page.getByText(/Payment schedule/i)).toBeVisible()
    await expect(page.getByText(/Estimated start/i)).toBeVisible()
    await expect(page.getByText(/Valid for \(days\)/i)).toBeVisible()
  })

  test("public share link renders without auth and DOES NOT show markup %", async ({
    browser,
  }) => {
    const ctx = await browser.newContext() // no cookies — anonymous customer
    const page = await ctx.newPage()
    const response = await page.goto(`/proposal/${shareToken}`)
    expect(response?.status()).toBeLessThan(400)
    await expect(page.getByText("Proposal E2E project")).toBeVisible()

    // Customers should NOT see internal markup line — that's contractor margin.
    await expect(page.getByText(/Markup \(/i)).toHaveCount(0)
    // They SHOULD see a project subtotal.
    await expect(page.getByText(/Project subtotal/i)).toBeVisible()

    await ctx.close()
  })

  test("customer can sign the proposal", async ({ browser }) => {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    await page.goto(`/proposal/${shareToken}`)

    await page.fill('input[name="name"]', "Customer Name")
    await page.check('input[name="consent"]')
    await page.getByRole("button", { name: /Sign and accept/i }).click()

    // Page revalidates; the signed-state celebration should appear.
    await expect(page.getByText(/Proposal accepted/i)).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/Customer Name/)).toBeVisible()

    await ctx.close()
  })

  test("contractor view shows the acceptance + void button does not crash", async ({
    context,
    page,
  }) => {
    await loginAsTestUser(context)
    await page.goto(`/projects/${projectId}/proposal`)

    // Should show "Accepted by Customer Name". This used to crash before
    // c7f4110 because the void button passed onClick from a server
    // component — now lives in <ConfirmSubmitButton>.
    await expect(page.getByText(/Accepted by Customer Name/i)).toBeVisible()
    await expect(page.getByRole("button", { name: /^Void$/i })).toBeVisible()
  })

  test("expired proposal shows the expired notice instead of sign form", async ({
    browser,
  }) => {
    // Create a project whose proposalSentAt is 100 days ago and validForDays=30.
    const prisma = new PrismaClient({
      adapter: new PrismaLibSql({ url: "file:./test.db" }),
    })
    const expiredToken = "expired-proposal-token-32-chars-lng"
    const expiredProject = await prisma.project.create({
      data: {
        userId: TEST_USER.id,
        name: "Expired E2E",
        clientName: "Old Client",
        proposalSentAt: new Date(Date.now() - 100 * 86400_000),
        validForDays: 30,
        shareToken: expiredToken,
      },
    })
    await prisma.$disconnect()

    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    await page.goto(`/proposal/${expiredToken}`)

    await expect(page.getByText(/This proposal has expired/i)).toBeVisible()
    // Sign form should NOT be visible.
    await expect(page.locator('input[name="name"]')).toHaveCount(0)

    await ctx.close()
    // Best-effort cleanup
    void expiredProject
  })
})
