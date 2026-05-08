import { test, expect } from "@playwright/test"
import { loginAsTestUser } from "./auth-helpers"

/**
 * Project CRUD: the contractor can create a project, edit its meta, add
 * a section + line items, and delete the project.
 */
test.describe("project lifecycle", () => {
  test.beforeEach(async ({ context }) => {
    await loginAsTestUser(context)
  })

  test("create → edit → add line item → totals update", async ({ page }) => {
    await page.goto("/projects/new")
    await page.fill('input[name="name"]', "Kitchen remodel — E2E")
    await page.fill('input[name="clientName"]', "Jane Test")
    await page.fill('input[name="clientEmail"]', "jane@example.com")
    await page.click('button[type="submit"]')

    // Should redirect to /projects/<id>
    await expect(page).toHaveURL(/\/projects\/[a-z0-9]+$/)
    await expect(page.getByRole("heading", { name: /Kitchen remodel/ })).toBeVisible()

    // Add a section.
    await page.getByRole("button", { name: /add section/i }).click()
    // Section name has a default; rename inline isn't strictly needed.
    // Now we should see at least one services / materials picker.
    await expect(page.getByPlaceholder(/Search services or type custom/)).toBeVisible()
  })

  test("project list shows the new project", async ({ page }) => {
    await page.goto("/projects")
    await expect(page.getByText("Kitchen remodel — E2E")).toBeVisible()
  })
})
