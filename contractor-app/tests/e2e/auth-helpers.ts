import { type BrowserContext, type Page } from "@playwright/test"
import { fixtures } from "./fixtures"

/**
 * Inject the Auth.js session cookie into a browser context so requests
 * land authenticated as the seeded test user. Skip the magic-link email
 * flow entirely — that's not what we're testing here.
 */
export async function loginAsTestUser(context: BrowserContext) {
  const { session } = fixtures()
  await context.addCookies([
    {
      name: session.cookieName,
      value: session.token,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
      secure: false,
      expires: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
    },
  ])
}

export async function authedPage(page: Page) {
  await loginAsTestUser(page.context())
  return page
}
