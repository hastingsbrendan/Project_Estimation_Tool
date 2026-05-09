import { test, expect } from "@playwright/test"

/**
 * /login/confirm interstitial — commit 5683523.
 *
 * Why this test exists: the magic-link flow now lands on this page
 * BEFORE the Auth.js callback so corporate link-scanners don't burn
 * the verification token before the user clicks. This page is a
 * server component that renders an <a> to the real callback. If it
 * ever crashed in a prod build (e.g. an `await searchParams` typo, a
 * server-only import in a client boundary, etc.), every magic-link
 * sign-in in production would fail.
 *
 * We don't drive the full auth round-trip — that's covered by
 * loginAsTestUser cookie injection. We just assert the page renders,
 * shows the email, and exposes the consume URL as a real link.
 */

test.describe("magic-link interstitial", () => {
  test("renders the confirm card with the email and a callback link", async ({
    page,
  }) => {
    const url =
      "/login/confirm?token=tok_abc123&email=ricky%40example.com&callbackUrl=%2Fprojects"
    const response = await page.goto(url)
    expect(response?.status()).toBeLessThan(400)

    // No error boundary
    await expect(
      page.locator("text=/Something (went wrong|broke on this page)/i"),
    ).toHaveCount(0)

    // Email + heading visible
    await expect(page.getByText("ricky@example.com")).toBeVisible()
    await expect(page.getByRole("heading", { name: /Confirm sign-in/i })).toBeVisible()

    // The Continue button must be a real link to the Auth.js callback
    // and must preserve the token + email + callbackUrl. If this ever
    // becomes a <button onClick> we'd silently break the flow because
    // the click wouldn't actually consume the token.
    const link = page.getByRole("link", { name: /Continue to Contractor App/i })
    await expect(link).toBeVisible()
    const href = await link.getAttribute("href")
    expect(href).toContain("/api/auth/callback/nodemailer")
    expect(href).toContain("token=tok_abc123")
    expect(href).toContain("email=ricky%40example.com")
    expect(href).toContain("callbackUrl=%2Fprojects")
  })

  test("renders the invalid-link state when token or email is missing", async ({
    page,
  }) => {
    const response = await page.goto("/login/confirm")
    expect(response?.status()).toBeLessThan(400)
    await expect(page.getByText(/Invalid sign-in link/i)).toBeVisible()
    await expect(page.getByRole("link", { name: /Back to sign-in/i })).toBeVisible()
  })
})
