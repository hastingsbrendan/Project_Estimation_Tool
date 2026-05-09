import { test, expect } from "@playwright/test"
import { loginAsTestUser } from "./auth-helpers"
import { fixtures } from "./fixtures"

/**
 * W3.5 — assign subs to specific service line items, mark services
 * complete, verify many-to-many works. Fixtures (smoke project + service
 * line item + two subs) are seeded by tests/e2e/seed-user.ts.
 *
 * The chips component is purely view-over-server-actions; there's no
 * client-side optimistic state, so each interaction triggers a router
 * refresh. Assertions wait on visibility rather than timing.
 */

test.describe("project — service assignments + completion", () => {
  test.beforeEach(async ({ context }) => {
    await loginAsTestUser(context)
  })

  test("assign one sub → chip appears on the service row", async ({ page }) => {
    const f = fixtures()
    const lineItemId = f.smoke.serviceLineItemId
    expect(lineItemId, "seed didn't capture a service line item id").toBeTruthy()

    await page.goto(`/projects/${f.smoke.projectId}`)

    const row = page.locator(`[data-line-item-id="${lineItemId}"]`)
    await expect(row).toBeVisible()
    // Pristine state — no chips yet.
    await expect(row.getByText("No subs assigned")).toBeVisible()

    await row.getByRole("button", { name: /\+ assign/i }).click()
    await row
      .getByRole("combobox")
      .selectOption({ label: f.subs.a.name })

    // Server action + router refresh — chip should land.
    await expect(row.getByText(f.subs.a.name)).toBeVisible()
  })

  test("a second sub on the same service — many-to-many works", async ({ page }) => {
    const f = fixtures()
    const lineItemId = f.smoke.serviceLineItemId!
    await page.goto(`/projects/${f.smoke.projectId}`)
    const row = page.locator(`[data-line-item-id="${lineItemId}"]`)

    await row.getByRole("button", { name: /\+ assign/i }).click()
    await row
      .getByRole("combobox")
      .selectOption({ label: f.subs.b.name })

    // Both chips visible.
    await expect(row.getByText(f.subs.a.name)).toBeVisible()
    await expect(row.getByText(f.subs.b.name)).toBeVisible()
  })

  test("toggle complete flips Done/To do label", async ({ page }) => {
    const f = fixtures()
    const lineItemId = f.smoke.serviceLineItemId!
    await page.goto(`/projects/${f.smoke.projectId}`)
    const row = page.locator(`[data-line-item-id="${lineItemId}"]`)

    await expect(row).toHaveAttribute("data-completed", "0")
    await expect(row.getByText("To do", { exact: true })).toBeVisible()

    await row.getByRole("checkbox", { name: /Mark service complete/i }).check()

    await expect(row).toHaveAttribute("data-completed", "1")
    await expect(row.getByText("Done", { exact: true })).toBeVisible()
  })

  test("unassign — chip removed", async ({ page }) => {
    const f = fixtures()
    const lineItemId = f.smoke.serviceLineItemId!
    await page.goto(`/projects/${f.smoke.projectId}`)
    const row = page.locator(`[data-line-item-id="${lineItemId}"]`)

    // Sub B was assigned in the prior test (this suite runs serially against
    // a shared DB). Unassign.
    await row.getByRole("button", { name: `Unassign ${f.subs.b.name}` }).click()
    await expect(row.getByText(f.subs.b.name)).toHaveCount(0)
    // Sub A should still be there.
    await expect(row.getByText(f.subs.a.name)).toBeVisible()
  })
})
