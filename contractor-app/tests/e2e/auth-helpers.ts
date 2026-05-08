import { type BrowserContext, type Page } from "@playwright/test"
import { TEST_SESSION } from "./seed-user"

/**
 * Inject the Auth.js session cookie into a browser context so requests
 * land authenticated as the seeded test user. Skip the magic-link email
 * flow entirely — that's not what we're testing here, and Resend isn't
 * even wired up in test env.
 */
export async function loginAsTestUser(context: BrowserContext) {
  await context.addCookies([
    {
      name: TEST_SESSION.cookieName,
      value: TEST_SESSION.token,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
      // Tests run on http://localhost so secure must be false.
      secure: false,
      expires: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
    },
  ])
}

/**
 * Convenience for tests that want a fresh authed page without managing
 * the context themselves.
 */
export async function authedPage(page: Page) {
  await loginAsTestUser(page.context())
  return page
}
