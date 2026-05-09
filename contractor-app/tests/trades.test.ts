import { describe, it, expect } from "vitest"
import {
  TRADES,
  TRADE_SLUGS,
  parseTradeSlug,
  tradeLabel,
} from "../lib/catalog/trades"

/**
 * The trade taxonomy is the single source of truth for catalog/trade
 * coercion (commit 2a11034). `parseTradeSlug` is called inside the
 * `applyCatalogUpdates` server action — if it ever threw on weird input,
 * a contractor applying a receipt with a stale/bogus trade string would
 * see the action 500 instead of writing the row. These tests pin the
 * "never throw, always coerce" contract.
 */

describe("parseTradeSlug", () => {
  it("returns the slug as-is for every known trade", () => {
    for (const t of TRADES) {
      expect(parseTradeSlug(t.value)).toBe(t.value)
    }
  })

  it("lowercases and trims input before matching", () => {
    expect(parseTradeSlug("  Plumbing  ")).toBe("plumbing")
    expect(parseTradeSlug("ELECTRICAL")).toBe("electrical")
  })

  it("falls back to 'finish' for unknown / stale strings", () => {
    expect(parseTradeSlug("masonry")).toBe("finish")
    expect(parseTradeSlug("")).toBe("finish")
    expect(parseTradeSlug("   ")).toBe("finish")
  })

  it("falls back to 'finish' for null and undefined (never throws)", () => {
    expect(parseTradeSlug(null)).toBe("finish")
    expect(parseTradeSlug(undefined)).toBe("finish")
  })
})

describe("tradeLabel", () => {
  it("returns the human label for known slugs", () => {
    expect(tradeLabel("plumbing")).toBe("Plumbing")
    expect(tradeLabel("finish")).toBe("Finish carpentry")
    expect(tradeLabel("hvac")).toBe("HVAC")
  })

  it("title-cases unknown slugs as a defensive fallback", () => {
    // Old data with a stale trade row should still render readably.
    expect(tradeLabel("masonry")).toBe("Masonry")
  })
})

describe("TRADE_SLUGS", () => {
  it("matches the slugs exposed via TRADES", () => {
    expect(TRADE_SLUGS).toEqual(TRADES.map((t) => t.value))
  })

  it("has unique slugs (catches accidental duplicates on a new trade)", () => {
    expect(new Set(TRADE_SLUGS).size).toBe(TRADE_SLUGS.length)
  })
})
