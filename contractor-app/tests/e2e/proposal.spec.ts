import { test, expect } from "@playwright/test"
import { loginAsTestUser } from "./auth-helpers"
import { fixtures } from "./fixtures"

/**
 * Proposal lifecycle. Fixtures (proposal project + share token, expired
 * project + token) come from tests/e2e/seed-user.ts.
 */
test.describe("proposal lifecycle", () => {
  test("contractor proposal editor renders with all sections", async ({
    context,
    page,
  }) => {
    await loginAsTestUser(context)
    await page.goto(`/projects/${fixtures().proposal.projectId}/proposal`)

    await expect(page.getByText(/Scope of work/i)).toBeVisible()
    await expect(page.getByText(/Exclusions/i)).toBeVisible()
    await expect(page.getByText(/Payment schedule/i)).toBeVisible()
    await expect(page.getByText(/Estimated start/i)).toBeVisible()
    await expect(page.getByText(/Valid for \(days\)/i)).toBeVisible()
  })

  test("public share link renders without auth and DOES NOT show markup %", async ({
    browser,
  }) => {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    const response = await page.goto(`/proposal/${fixtures().proposal.shareToken}`)
    expect(response?.status()).toBeLessThan(400)
    await expect(page.getByText("Proposal E2E project")).toBeVisible()
    await expect(page.getByText(/Markup \(/i)).toHaveCount(0)
    await expect(page.getByText(/Project subtotal/i)).toBeVisible()
    await ctx.close()
  })

  test("customer can sign the proposal", async ({ browser }) => {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    await page.goto(`/proposal/${fixtures().proposal.shareToken}`)

    await page.fill('input[name="name"]', "Customer Name")
    await page.check('input[name="consent"]')
    await page.getByRole("button", { name: /Sign and accept/i }).click()

    await expect(page.getByText(/Proposal accepted/i)).toBeVisible({
      timeout: 10_000,
    })
    // Three places render "Customer Name" after signing (header, client
    // card, signed-by line). Just assert the signed-by line exists.
    await expect(page.getByText(/Signed by/i)).toBeVisible()
    await ctx.close()
  })

  test("contractor view shows the acceptance + Void button (c7f4110 regression)", async ({
    context,
    page,
  }) => {
    await loginAsTestUser(context)
    await page.goto(`/projects/${fixtures().proposal.projectId}/proposal`)
    await expect(page.getByText(/Accepted by Customer Name/i)).toBeVisible()
    await expect(page.getByRole("button", { name: /^Void$/i })).toBeVisible()
  })

  test("expired proposal shows the expired notice instead of sign form", async ({
    browser,
  }) => {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    await page.goto(`/proposal/${fixtures().expired.shareToken}`)

    await expect(page.getByText(/This proposal has expired/i)).toBeVisible()
    await expect(page.locator('input[name="name"]')).toHaveCount(0)
    await ctx.close()
  })
})
