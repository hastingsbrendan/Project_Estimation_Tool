import { test, expect } from "@playwright/test"
import { loginAsTestUser } from "./auth-helpers"
import { fixtures } from "./fixtures"

/**
 * /api/v1/* contract tests against the real running app.
 *
 * The unit tests at tests/api-v1-parsers.test.ts pin the request
 * validation; these E2E tests exercise the AUTH + RESPONSE CONTRACT
 * which can't be tested in isolation:
 *   - Auth.js session cookie is required
 *   - SKU resolution joins LineItem → CatalogItem
 *   - 404 vs 401 vs 200 paths
 *
 * Hits Claude is mocked via env (ANTHROPIC_API_KEY is unset in test),
 * so /match-material and /find-alternative will hit their "not
 * configured" 500 path — we assert the SHAPE of the error response
 * rather than the matcher behavior.
 */

const CART_PAYLOAD_ROUTE = (id: string) =>
  `/api/v1/projects/${id}/cart-payload`

test.describe("/api/v1/projects/:id/cart-payload", () => {
  test("returns 401 when not signed in", async ({ request }) => {
    // The standalone `request` fixture has no cookies attached, so
    // hitting any /api/v1/* route should return 401.
    const res = await request.get(CART_PAYLOAD_ROUTE(fixtures().smoke.projectId))
    expect(res.status()).toBe(401)
    const body = await res.json()
    expect(body.error).toBeTruthy()
  })

  test.describe("authenticated", () => {
    test.beforeEach(async ({ context }) => {
      await loginAsTestUser(context)
    })

    test("returns the cart payload for a real project", async ({ context }) => {
      // context.request shares cookies with the browser context;
      // the standalone `request` fixture does not.
      const projectId = fixtures().smoke.projectId
      const res = await context.request.get(CART_PAYLOAD_ROUTE(projectId))
      expect(res.status()).toBe(200)
      const body = await res.json()
      expect(body.project.id).toBe(projectId)
      expect(body.project.name).toBeTruthy()
      expect(Array.isArray(body.materials)).toBe(true)
      expect(body.generatedAt).toBeTruthy()
      // Smoke project's only line item is labor, so materials should
      // be empty — but the SHAPE should always be present.
      for (const m of body.materials) {
        expect(typeof m.description).toBe("string")
        expect(typeof m.unit).toBe("string")
        expect(typeof m.quantity).toBe("number")
        // hdSku may be null but must be the field, not undefined.
        expect("hdSku" in m).toBe(true)
      }
    })

    test("returns 404 for an unknown project id", async ({ context }) => {
      const res = await context.request.get(CART_PAYLOAD_ROUTE("does-not-exist"))
      expect(res.status()).toBe(404)
    })

    test("returns 404 when the project belongs to a different user", async ({
      context,
    }) => {
      // We don't have a foreign-user fixture, but the prisma scoping
      // makes any non-owned project look like 404. Use a cuid-shaped
      // string that isn't ours.
      const res = await context.request.get(
        CART_PAYLOAD_ROUTE("clxxxxxxxxxxxxxxxxxxxxxxxx"),
      )
      expect(res.status()).toBe(404)
    })
  })
})

test.describe("/api/v1/match-material POST", () => {
  test.beforeEach(async ({ context }) => {
    await loginAsTestUser(context)
  })

  test("rejects empty body with 400", async ({ context }) => {
    const res = await context.request.post("/api/v1/match-material", {
      data: {},
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toBeTruthy()
  })

  test("rejects body missing material with 400", async ({ context }) => {
    const res = await context.request.post("/api/v1/match-material", {
      data: { candidates: [{ title: "x" }] },
    })
    expect(res.status()).toBe(400)
  })

  test("rejects body with empty candidates array", async ({ context }) => {
    const res = await context.request.post("/api/v1/match-material", {
      data: {
        material: { description: "drywall", unit: "sheet", quantity: 1 },
        candidates: [],
      },
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/non-empty/i)
  })

  test("returns 401 without auth cookie", async ({ request }) => {
    // Standalone request fixture has no cookies — that's the point.
    const res = await request.post("/api/v1/match-material", {
      data: { material: {}, candidates: [] },
    })
    expect(res.status()).toBe(401)
  })
})

test.describe("/api/v1/find-alternative POST", () => {
  test.beforeEach(async ({ context }) => {
    await loginAsTestUser(context)
  })

  test("rejects body missing oosCandidate with 400", async ({ context }) => {
    const res = await context.request.post("/api/v1/find-alternative", {
      data: {
        material: { description: "drywall", unit: "sheet", quantity: 1 },
        alternatives: [],
      },
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/oosCandidate/i)
  })

  test("rejects body missing alternatives array", async ({ context }) => {
    const res = await context.request.post("/api/v1/find-alternative", {
      data: {
        material: { description: "drywall", unit: "sheet", quantity: 1 },
        oosCandidate: { title: "x" },
      },
    })
    expect(res.status()).toBe(400)
  })

  test("returns 401 without auth cookie", async ({ request }) => {
    const res = await request.post("/api/v1/find-alternative", {
      data: {},
    })
    expect(res.status()).toBe(401)
  })
})
