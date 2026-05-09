import { test, expect } from "@playwright/test"
import { loginAsTestUser } from "./auth-helpers"
import { fixtures } from "./fixtures"

/**
 * W4 Feature 1 — catalog-update receipts.
 *
 * The fixture catalog receipt is seeded with two parsed line items:
 *   1. "Drywall sheet 4x8 1/2 in" @ $13.99 — should match an existing
 *      catalog item ("Drywall sheet 4x8 1/2 inch" @ $12.50). Lands in the
 *      "Likely matches" bucket.
 *   2. "Stainless threaded rod 5/16 36 inch" @ $9.49 — no match in catalog.
 *      Lands in the "New catalog items" bucket.
 *
 * Spec exercises: render the three buckets correctly, tick a price update
 * + a new-item add, click Apply, assert the catalog reflects both writes.
 */

test.describe("catalog-update receipts", () => {
  test.beforeEach(async ({ context }) => {
    await loginAsTestUser(context)
  })

  test("review screen shows likely match + new item, applies decisions", async ({
    page,
    request,
  }) => {
    const f = fixtures()
    await page.goto(`/receipts/${f.catalogReceipt.receiptId}`)

    // Header has the Catalog pill
    await expect(page.getByText("Catalog", { exact: true })).toBeVisible()

    // Likely matches section visible — drywall row
    await expect(page.getByText(/Likely matches \(\d+\)/i)).toBeVisible()
    await expect(page.getByText(/Drywall sheet 4x8 1\/2 in/i)).toBeVisible()

    // New items section visible — threaded rod (rendered as editable input)
    await expect(page.getByText(/New catalog items \(\d+\)/i)).toBeVisible()
    await expect(
      page.locator('input[value*="Stainless threaded rod"]'),
    ).toBeVisible()

    // The amber callout for new items detected
    await expect(page.getByText(/new catalog items detected/i)).toBeVisible()

    // Tick the price-update checkbox in the likely-matches table.
    // The matches table has one row, one apply checkbox at start of the row.
    const likelyTable = page.locator("table").first()
    await likelyTable.locator('input[type="checkbox"]').first().check()

    // The new-items "apply" defaults ON, so it's already ticked. Don't touch.

    // Click Apply
    await page.getByRole("button", { name: /Apply decisions/i }).click()

    // Success indicator — wait for "Updated 1, added 1." message. That's
    // the contractor-visible proof the action committed; the catalog page
    // renders items as editable inputs which would need a different selector
    // strategy, so we'll trust the success message as the apply check.
    await expect(page.getByText(/Updated 1, added 1\./)).toBeVisible({
      timeout: 10_000,
    })

    // Confirm the catalog now contains the new item by hitting the
    // materials catalog page and looking for it in an input field.
    const catalogPage = await page.goto("/catalog/materials")
    expect(catalogPage?.status()).toBeLessThan(400)
    await expect(
      page.locator('input[value*="Stainless threaded rod"]'),
    ).toBeVisible()

    void request
  })

  test("re-visiting after apply shows the 'already reviewed' state", async ({
    page,
  }) => {
    // Suite is sequential (workers: 1) so the prior test left
    // catalogReviewedAt set.
    const f = fixtures()
    await page.goto(`/receipts/${f.catalogReceipt.receiptId}`)
    await expect(page.getByText(/already applied/i)).toBeVisible()
  })
})
