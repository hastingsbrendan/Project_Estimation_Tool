import { describe, it, expect } from "vitest"
import { decideHdSkuWrite } from "../lib/catalog/sku-guardrail"

/**
 * The receipt → catalog SKU feedback loop is the second-most
 * destructive thing we ship (after the proposal-share flow): a
 * regression here silently overwrites user-entered SKUs with values
 * parsed off a faded receipt photo. These tests pin the guardrail's
 * decision matrix so any future refactor that changes the logic
 * tells us up-front.
 */
describe("decideHdSkuWrite", () => {
  it("writes the requested SKU when catalog has none", () => {
    expect(decideHdSkuWrite({ existing: null, requested: "100075069" })).toBe(
      "100075069",
    )
  })

  it("writes the requested SKU when catalog row had empty string", () => {
    expect(decideHdSkuWrite({ existing: "", requested: "100075069" })).toBe(
      "100075069",
    )
  })

  it("preserves a different existing SKU — never silently overwrites", () => {
    // The most important case. A faded receipt mis-parsed as
    // 999999999 must not destroy the user-entered 100075069.
    expect(
      decideHdSkuWrite({ existing: "100075069", requested: "999999999" }),
    ).toBeUndefined()
  })

  it("writes (idempotently) when existing and requested already agree", () => {
    expect(
      decideHdSkuWrite({ existing: "100075069", requested: "100075069" }),
    ).toBe("100075069")
  })

  it("trims whitespace on both sides before comparing", () => {
    expect(
      decideHdSkuWrite({ existing: "  100075069 ", requested: "100075069" }),
    ).toBe("100075069")
    expect(
      decideHdSkuWrite({ existing: "100075069", requested: " 100075069\n" }),
    ).toBe("100075069")
  })

  it("skips when requested is empty / null / whitespace-only", () => {
    expect(decideHdSkuWrite({ existing: null, requested: "" })).toBeUndefined()
    expect(
      decideHdSkuWrite({ existing: null, requested: null }),
    ).toBeUndefined()
    expect(
      decideHdSkuWrite({ existing: null, requested: undefined }),
    ).toBeUndefined()
    expect(
      decideHdSkuWrite({ existing: "100075069", requested: "   " }),
    ).toBeUndefined()
  })

  it("does not coerce a different existing SKU just because requested is blank", () => {
    // Defense-in-depth: blank request shouldn't accidentally clear an
    // existing SKU even though the action layer already filters this
    // case before calling.
    expect(
      decideHdSkuWrite({ existing: "100075069", requested: "" }),
    ).toBeUndefined()
  })
})
