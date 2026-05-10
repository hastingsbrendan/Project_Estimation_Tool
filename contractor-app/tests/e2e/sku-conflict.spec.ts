import { test, expect } from "@playwright/test"
import { loginAsTestUser } from "./auth-helpers"
import { fixtures } from "./fixtures"

/**
 * Destructive-write protection for the receipt → catalog SKU feedback
 * loop. The pure decision matrix is unit-tested at
 * tests/sku-guardrail.test.ts; this spec exercises the FULL flow:
 *
 *   1. Catalog row already has hdSku = "EXISTING-SKU-100"
 *   2. Receipt parses a matching line with sku = "RECEIPT-SKU-999"
 *   3. Contractor opens the review page, ticks the price-update
 *      checkbox, but does NOT tick the "Overwrite" checkbox in the
 *      SKU-conflict warning row.
 *   4. After Apply: catalog row's hdSku must STILL be the original
 *      "EXISTING-SKU-100" — the user's saved SKU is preserved.
 *
 * If this test ever flips, a Prisma transaction bug or a UI default
 * regression has snuck through.
 */

test.describe("SKU conflict guardrail", () => {
  test.beforeEach(async ({ context }) => {
    await loginAsTestUser(context)
  })

  test("preserves existing SKU when conflict is not overridden", async ({
    page,
  }) => {
    const f = fixtures()

    await page.goto(`/receipts/${f.skuConflict.receiptId}`)

    // Confirm the conflict UI rendered. The SkuRow's amber callout
    // shows both SKUs explicitly.
    await expect(
      page.getByText(`SKU conflict — catalog: ${f.skuConflict.existingSku}`),
    ).toBeVisible()
    await expect(
      page.getByText(f.skuConflict.conflictingReceiptSku),
    ).toBeVisible()

    // The Overwrite checkbox is OFF by default in the conflict path.
    // We assert that explicitly and leave it OFF.
    const overwriteLabel = page.getByText(/Overwrite/i)
    await expect(overwriteLabel).toBeVisible()
    const overwriteCheckbox = overwriteLabel
      .locator("..")
      .locator('input[type="checkbox"]')
    await expect(overwriteCheckbox).not.toBeChecked()

    // Tick the row-apply checkbox (price-update opt-in).
    const likelyTable = page.locator("table").first()
    await likelyTable.locator('input[type="checkbox"]').first().check()

    // Apply.
    await page.getByRole("button", { name: /Apply decisions/i }).click()
    await expect(page.getByText(/Updated 1, added/i)).toBeVisible()

    // Verify by visiting the catalog materials page and reading the
    // hidden hdSku input on the matching row. Survives any redesign
    // of the visible SKU edit affordance.
    await page.goto("/catalog/materials")
    const matchingRow = page
      .locator(
        `input[name="description"][value="${f.skuConflict.existingDescription}"]`,
      )
      .locator("xpath=ancestor::*[.//input[@name='hdSku']][1]")
    const skuInput = matchingRow.locator('input[name="hdSku"]').first()
    await expect(skuInput).toHaveValue(f.skuConflict.existingSku)
  })
})
