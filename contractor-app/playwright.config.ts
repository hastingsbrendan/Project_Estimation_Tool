import { defineConfig, devices } from "@playwright/test"
import path from "node:path"

/**
 * Playwright runs against a real production build of the app on port 3100.
 * Why a prod build (not dev)?
 *  - Today's `Event handlers cannot be passed to Client Component props`
 *    bug only surfaces in production. Dev tolerates it.
 *  - Server actions, RSC streaming, and the bundler all behave differently.
 *    Catching prod-only bugs is the whole point of this layer.
 *
 * Tests use a separate sqlite file (test.db) seeded by tests/e2e/setup.ts
 * so dev data is never touched.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false, // shared DB; serialize so tests don't stomp each other
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : [["list"], ["html", { open: "never" }]],

  globalSetup: path.resolve(__dirname, "tests/e2e/global-setup.ts"),

  use: {
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: {
    // `npm run start` requires a prior `npm run build` — globalSetup runs
    // both so the user only has to type `npm run test:e2e`.
    command: "npm run start -- --port 3100",
    url: "http://localhost:3100",
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    env: {
      // Point the server at the test DB. tests/e2e/global-setup.ts has
      // already migrated + seeded it before this server boots.
      DATABASE_URL: "file:./test.db",
      // Disable real outbound — tests should never email or hit Anthropic.
      RESEND_API_KEY: "",
      ANTHROPIC_API_KEY: "",
      FEEDBACK_WEBHOOK_URL: "",
      AUTH_SECRET: "test-secret-not-for-production-use-32-chars",
      AUTH_TRUST_HOST: "true",
      // Auth.js v5 needs a stable URL for callbacks.
      AUTH_URL: "http://localhost:3100",
      NEXTAUTH_URL: "http://localhost:3100",
    },
  },
})
