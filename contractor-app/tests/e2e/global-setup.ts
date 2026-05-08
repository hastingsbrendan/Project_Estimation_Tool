import { execSync } from "node:child_process"
import { rmSync, existsSync, mkdirSync } from "node:fs"
import path from "node:path"
import { spawn } from "node:child_process"

/**
 * Runs once before any test in the suite. Responsibilities:
 *
 *  1. Wipe + recreate the test sqlite DB so tests start from a known state.
 *  2. Apply all Prisma migrations to it.
 *  3. Seed the test user + session token used by tests/e2e/auth-helpers.ts.
 *  4. Build the Next.js app once (caching avoids the rebuild on every test
 *     run — delete `.next` to force a rebuild).
 *
 * Doesn't start the web server — Playwright's `webServer` config does that.
 */
export default async function globalSetup() {
  const cwd = path.resolve(__dirname, "..", "..")
  const testDb = path.join(cwd, "test.db")
  const testDbJournal = `${testDb}-journal`

  console.log("[e2e] Resetting test DB…")
  if (existsSync(testDb)) rmSync(testDb)
  if (existsSync(testDbJournal)) rmSync(testDbJournal)

  // Prisma migrate deploy uses DATABASE_URL from env — set it temporarily.
  console.log("[e2e] Applying migrations…")
  execSync("npx prisma migrate deploy", {
    cwd,
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: "file:./test.db" },
  })

  console.log("[e2e] Seeding test user + session…")
  // Run a small node script that imports prisma and creates the fixture.
  // We use a child process so the seed script picks up our overridden
  // DATABASE_URL without polluting this parent process's env.
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(
      process.execPath,
      ["--import", "tsx", path.join(cwd, "tests/e2e/seed-user.ts")],
      {
        cwd,
        stdio: "inherit",
        env: { ...process.env, DATABASE_URL: "file:./test.db" },
      },
    )
    proc.on("exit", (code) => {
      if (code === 0) resolve()
      else reject(new Error(`Seed exited with code ${code}`))
    })
    proc.on("error", reject)
  })

  // Build the app once so `next start` has something to serve. Delete
  // .next first only if a previous build was for the wrong env.
  if (!existsSync(path.join(cwd, ".next"))) {
    mkdirSync(path.join(cwd, ".next"), { recursive: true })
    console.log("[e2e] Running production build…")
    execSync("npm run build", {
      cwd,
      stdio: "inherit",
      env: {
        ...process.env,
        DATABASE_URL: "file:./test.db",
        AUTH_SECRET: "test-secret-not-for-production-use-32-chars",
        AUTH_URL: "http://localhost:3100",
        NEXTAUTH_URL: "http://localhost:3100",
        AUTH_TRUST_HOST: "true",
      },
    })
  } else {
    console.log("[e2e] Re-using existing .next build (delete it to force rebuild)")
  }
}
