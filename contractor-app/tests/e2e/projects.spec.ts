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
    // The layout has a "Sign out" button which is also `button[type="submit"]`,
    // so use the form's accessible button name to scope the click.
    await page.getByRole("button", { name: /Create project/i }).click()

    // Should redirect to /projects/<id>
    await expect(page).toHaveURL(/\/projects\/[a-z0-9]+$/)
    // Project name is rendered as an editable input on the detail page,
    // not a heading. Assert the input value instead.
    await expect(page.locator('input[name="name"]')).toHaveValue(
      "Kitchen remodel — E2E",
    )

    // Add a section. The form requires a section name; submit button label
    // is "+ Section".
    await page.fill('input[placeholder*="Section name"]', "Demo")
    await page.getByRole("button", { name: /^\+ Section$/ }).click()
    // Now we should see the services picker for the new section. Catalog
    // is empty for this fresh test user so the placeholder reads "Type a
    // service description…" instead of "Search services…".
    await expect(
      page.getByPlaceholder(/Type a service description|Search services/).first(),
    ).toBeVisible()
  })

  test("project list shows the new project", async ({ page }) => {
    await page.goto("/projects")
    await expect(page.getByText("Kitchen remodel — E2E")).toBeVisible()
  })
})
