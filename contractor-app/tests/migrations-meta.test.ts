import { describe, it, expect } from "vitest"
import { readdirSync } from "node:fs"
import path from "node:path"
import { LATEST_MIGRATION } from "../lib/migrations-meta"

/**
 * Keeps lib/migrations-meta.ts honest. The /api/health drift check
 * compares the prod DB's applied-migrations high-water mark against
 * LATEST_MIGRATION — if someone adds a migration and forgets to bump
 * the constant, drift detection silently stops working. This test
 * makes that forgetfulness a CI failure instead.
 */
describe("migrations metadata", () => {
  it("LATEST_MIGRATION matches the newest migration directory", () => {
    const dir = path.resolve(__dirname, "..", "prisma", "migrations")
    const newest = readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort()
      .at(-1)
    expect(LATEST_MIGRATION).toBe(newest)
  })
})
