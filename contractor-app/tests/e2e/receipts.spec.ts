import { test, expect } from "@playwright/test"
import { loginAsTestUser } from "./auth-helpers"

/**
 * Receipt upload happy path. Uses a tiny in-memory PNG so we don't need
 * Vercel Blob to actually be wired up — the upload action returns
 * "Receipt storage isn't enabled yet" when BLOB_READ_WRITE_TOKEN is
 * absent, which is the test env. We assert that error specifically so we
 * know the action made it past the body-size limit and validation
 * (which is what was failing for Brendan's phone uploads).
 *
 * When BLOB_READ_WRITE_TOKEN is set in the test env, we additionally
 * assert that the detail page renders successfully — that's the page
 * that crashed in c7f4110 due to a server-component event handler.
 */
test.describe("receipts", () => {
  test.beforeEach(async ({ context }) => {
    await loginAsTestUser(context)
  })

  test("upload flow gates on BLOB token and surfaces a friendly error", async ({
    page,
  }) => {
    await page.goto("/receipts")
    await page.getByRole("button", { name: /Upload receipt/i }).click()

    // Modal should open
    await expect(page.getByText(/Receipt photo or PDF/i)).toBeVisible()

    // Build a 1x1 PNG and inject it into the file input.
    const pngBytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
      "base64",
    )
    await page.setInputFiles('input[type="file"]', {
      name: "test.png",
      mimeType: "image/png",
      buffer: pngBytes,
    })

    await page.getByRole("button", { name: /^Upload$/i }).click()

    // Without BLOB_READ_WRITE_TOKEN set, action returns the friendly
    // "Receipt storage isn't enabled yet" message in the modal — proving
    // the action body actually ran (body-size + validation passed).
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      await expect(
        page.getByText(/Receipt storage isn't enabled/i),
      ).toBeVisible({ timeout: 10_000 })
    } else {
      // Real blob configured: should redirect to /receipts/<id>.
      await expect(page).toHaveURL(/\/receipts\/[a-z0-9]+$/, { timeout: 15_000 })
      // Detail page must render (this is the c7f4110 regression check).
      await expect(page.getByText(/Items \(/i)).toBeVisible()
    }
  })
})
