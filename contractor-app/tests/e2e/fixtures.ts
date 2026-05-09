import { readFileSync } from "node:fs"
import path from "node:path"

/**
 * Read the fixtures JSON written by tests/e2e/seed-user.ts. Specs import
 * from here instead of Prisma — Playwright's TS loader doesn't deal well
 * with the generated Prisma client's CJS-style exports.
 */
type Fixtures = {
  user: { id: string; email: string; name: string }
  session: { cookieName: string; token: string }
  smoke: {
    projectId: string
    receiptId: string
    shareToken: string
    serviceLineItemId: string | null
  }
  proposal: { projectId: string; shareToken: string }
  expired: { projectId: string; shareToken: string }
  subs: {
    a: { id: string; name: string }
    b: { id: string; name: string }
  }
}

let cached: Fixtures | null = null

export function fixtures(): Fixtures {
  if (cached) return cached
  const file = path.resolve(__dirname, ".fixtures.json")
  cached = JSON.parse(readFileSync(file, "utf8")) as Fixtures
  return cached
}
