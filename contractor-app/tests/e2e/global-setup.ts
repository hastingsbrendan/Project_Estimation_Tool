import { execSync } from "node:child_process"
import { rmSync, existsSync } from "node:fs"
import path from "node:path"

/**
 * Runs once before any test in the suite. Responsibilities:
 *
 *  1. Wipe + recreate the test sqlite DB so tests start from a known state.
 *  2. Apply all Prisma migrations to it.
 *  3. Seed the test user + session token used by tests/e2e/auth-helpers.ts.
 *
 * Does NOT build the app — that's the `test:e2e:build` npm script chained
 * before `playwright test`. Splitting it lets `npm run test:e2e:ui`
 * iterate without a forced rebuild every run.
 *
 * Does NOT start the web server — Playwright's `webServer` config does that.
 */
export default async function globalSetup() {
  const cwd = path.resolve(__dirname, "..", "..")
  const testDb = path.join(cwd, "test.db")
  const testDbJournal = `${testDb}-journal`

  console.log("[e2e] Resetting test DB…")
  if (existsSync(testDb)) rmSync(testDb)
  if (existsSync(testDbJournal)) rmSync(testDbJournal)

  console.log("[e2e] Applying migrations to test.db…")
  execSync("npx prisma migrate deploy", {
    cwd,
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: "file:./test.db" },
  })

  console.log("[e2e] Seeding test user + session…")
  // Use execSync with cwd-relative path — spawn + shell:true mangles
  // paths containing spaces ("OneDrive\Documents\Claude Apps\..."). Run
  // tsx via npx so we don't depend on a global install.
  execSync("npx tsx tests/e2e/seed-user.ts", {
    cwd,
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: "file:./test.db" },
  })

  console.log("[e2e] Setup done. Playwright will now boot the webServer.")
}
