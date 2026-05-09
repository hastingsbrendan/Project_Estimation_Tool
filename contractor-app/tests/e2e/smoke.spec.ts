import { test, expect } from "@playwright/test"
import { loginAsTestUser } from "./auth-helpers"
import { fixtures } from "./fixtures"

/**
 * SMOKE TEST — visit every page that ships and assert it returns a 2xx,
 * not a 500. This is the test that catches the entire class of "bug only
 * shows up in prod builds" issues — like commit c7f4110's
 *
 *   Error: Event handlers cannot be passed to Client Component props.
 *
 * which crashed every receipt detail page render in production but ran
 * fine in dev.
 *
 * Fixture rows (smoke project + receipt + share token) are seeded by
 * tests/e2e/seed-user.ts and read back via fixtures().
 */

test.describe("smoke: authed pages", () => {
  test.beforeEach(async ({ context }) => {
    await loginAsTestUser(context)
  })

  const pages = [
    { name: "projects list", path: () => "/projects" },
    { name: "new project form", path: () => "/projects/new" },
    { name: "project detail", path: () => `/projects/${fixtures().smoke.projectId}` },
    {
      name: "project proposal editor",
      path: () => `/projects/${fixtures().smoke.projectId}/proposal`,
    },
    {
      name: "project materials list",
      path: () => `/projects/${fixtures().smoke.projectId}/materials`,
    },
    { name: "receipts list", path: () => "/receipts" },
    { name: "receipt detail", path: () => `/receipts/${fixtures().smoke.receiptId}` },
    { name: "services catalog", path: () => "/catalog/services" },
    { name: "materials catalog", path: () => "/catalog/materials" },
    { name: "subs list (empty)", path: () => "/subs" },
    { name: "subs 1099 page", path: () => "/subs/1099" },
  ]

  for (const p of pages) {
    test(`renders ${p.name}`, async ({ page }) => {
      const response = await page.goto(p.path())
      expect(response?.status(), `${p.path()} returned non-2xx`).toBeLessThan(400)
      const errorBoundary = page.locator(
        "text=/Something (went wrong|broke on this page)/i",
      )
      await expect(
        errorBoundary,
        `${p.path()} rendered the error boundary`,
      ).toHaveCount(0)
    })
  }
})

test.describe("smoke: public pages", () => {
  test("login page renders", async ({ page }) => {
    const response = await page.goto("/login")
    expect(response?.status()).toBeLessThan(400)
  })

  test("public proposal page renders for valid share token", async ({ page }) => {
    const response = await page.goto(`/proposal/${fixtures().smoke.shareToken}`)
    expect(response?.status()).toBeLessThan(400)
    // The header label is the only "PROPOSAL" rendered as exact-match;
    // other matches like "I have reviewed the proposal..." are partial
    // and would trip Playwright's strict mode. Use a more specific
    // assertion against the project name + proposal-page chrome.
    await expect(page.getByText("Smoke test project")).toBeVisible()
    await expect(page.getByText(/Project subtotal/i)).toBeVisible()
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
