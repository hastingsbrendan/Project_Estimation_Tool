import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"

// Hoisted mutable mock state. vi.hoisted lets the mock factory below
// reference this object even though vi.mock is hoisted above other
// imports. Each test patches `mockState` to control how the fake
// Anthropic client responds.
const mockState = vi.hoisted(() => ({
  shouldThrow: null as Error | null,
  responseText: '{"bestIdx": null, "confidence": 0, "reasoning": ""}',
}))

vi.mock("@anthropic-ai/sdk", () => ({
  default: class FakeAnthropic {
    messages = {
      create: async () => {
        if (mockState.shouldThrow) throw mockState.shouldThrow
        return {
          content: [{ type: "text", text: mockState.responseText }],
        }
      },
    }
  },
}))

import { __test, matchMaterial, findAlternatives } from "../lib/ai/material-matcher"

describe("material-matcher prompt shape", () => {
  it("encodes catalog material with description, unit, quantity", () => {
    const p = __test.buildMatchPrompt(
      { description: "2x4 stud, 8ft, SPF", unit: "ea", quantity: 12 },
      [{ title: "Test", sku: "1", url: "", price: 4.25, inStock: true, brand: null, pack: null }],
    )
    expect(p).toContain("2x4 stud, 8ft, SPF")
    expect(p).toContain("unit: ea")
    expect(p).toContain("quantity: 12")
  })

  it("includes notes when provided", () => {
    const p = __test.buildMatchPrompt(
      {
        description: "Drywall sheet",
        unit: "sheet",
        quantity: 1,
        notes: "Prefer Toughrock",
      },
      [{ title: "Test", sku: "1", url: "", price: null, inStock: true, brand: null, pack: null }],
    )
    expect(p).toContain("notes: Prefer Toughrock")
  })

  it("omits notes line when null", () => {
    const p = __test.buildMatchPrompt(
      { description: "Test", unit: "ea", quantity: 1, notes: null },
      [{ title: "Test", sku: "1", url: "", price: null, inStock: true, brand: null, pack: null }],
    )
    expect(p).not.toContain("notes:")
  })

  it("encodes each candidate with index, title, brand, pack, price, inStock", () => {
    const p = __test.buildMatchPrompt(
      { description: "Test", unit: "ea", quantity: 1 },
      [
        {
          title: "First",
          sku: "111",
          url: "",
          price: 9.99,
          inStock: true,
          brand: "BrandA",
          pack: "Pack of 50",
        },
        {
          title: "Second",
          sku: "222",
          url: "",
          price: null,
          inStock: false,
          brand: null,
          pack: null,
        },
      ],
    )
    expect(p).toContain("[0] First")
    expect(p).toContain("brand: BrandA")
    expect(p).toContain("pack: Pack of 50")
    expect(p).toContain("price: $9.99")
    expect(p).toContain("inStock: true")
    expect(p).toContain("[1] Second")
    expect(p).toContain("inStock: false")
    const secondLine = p.split("\n").find((l) => l.startsWith("[1]"))!
    expect(secondLine).not.toContain("brand:")
    expect(secondLine).not.toContain("pack:")
    expect(secondLine).not.toContain("price:")
  })

  it("does NOT leak SKUs or URLs into the prompt", () => {
    const p = __test.buildMatchPrompt(
      { description: "Test", unit: "ea", quantity: 1 },
      [
        {
          title: "Some product",
          sku: "ULTRA-SECRET-SKU-12345",
          url: "https://example.invalid/super/long/url/path",
          price: 5,
          inStock: true,
          brand: null,
          pack: null,
        },
      ],
    )
    expect(p).not.toContain("ULTRA-SECRET-SKU-12345")
    expect(p).not.toContain("super/long/url/path")
  })
})

describe("material-matcher JSON parser", () => {
  it("parses a clean JSON object", () => {
    const out = __test.parseJsonObjectFromText('{"bestIdx": 1, "confidence": 0.9}') as {
      bestIdx: number
      confidence: number
    }
    expect(out.bestIdx).toBe(1)
    expect(out.confidence).toBe(0.9)
  })

  it("strips markdown code fences", () => {
    const out = __test.parseJsonObjectFromText(
      '```json\n{"bestIdx": 0, "confidence": 0.5}\n```',
    ) as { bestIdx: number; confidence: number }
    expect(out.bestIdx).toBe(0)
    expect(out.confidence).toBe(0.5)
  })

  it("handles null bestIdx", () => {
    const out = __test.parseJsonObjectFromText(
      '{"bestIdx": null, "confidence": 0, "reasoning": "no plausible match"}',
    ) as { bestIdx: null; confidence: number }
    expect(out.bestIdx).toBeNull()
  })

  it("throws on non-JSON input", () => {
    expect(() => __test.parseJsonObjectFromText("not json")).toThrow()
  })
})

describe("matchMaterial — mocked SDK", () => {
  const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY

  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test-key"
    mockState.shouldThrow = null
    mockState.responseText = '{"bestIdx": null, "confidence": 0, "reasoning": ""}'
  })

  afterEach(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY
  })

  it("returns the parsed result on a well-formed Claude response", async () => {
    mockState.responseText = JSON.stringify({
      bestIdx: 1,
      confidence: 0.92,
      reasoning: "Same dimensions, same brand",
    })
    const result = await matchMaterial(
      { description: "2x4 stud", unit: "ea", quantity: 1 },
      [
        { title: "Off-brand", sku: "1", url: "", price: 3, inStock: true, brand: null, pack: null },
        { title: "Premium SPF stud 2x4 8ft", sku: "2", url: "", price: 4, inStock: true, brand: null, pack: null },
      ],
    )
    expect(result.bestIdx).toBe(1)
    expect(result.confidence).toBeCloseTo(0.92)
    expect(result.reasoning).toContain("Same dimensions")
  })

  it("clamps out-of-range bestIdx to null", async () => {
    mockState.responseText = '{"bestIdx": 99, "confidence": 0.9, "reasoning": "x"}'
    const result = await matchMaterial(
      { description: "x", unit: "ea", quantity: 1 },
      [{ title: "a", sku: "1", url: "", price: null, inStock: true, brand: null, pack: null }],
    )
    expect(result.bestIdx).toBeNull()
  })

  it("clamps confidence into [0,1]", async () => {
    mockState.responseText = '{"bestIdx": 0, "confidence": 1.7, "reasoning": "x"}'
    const high = await matchMaterial(
      { description: "x", unit: "ea", quantity: 1 },
      [{ title: "a", sku: "1", url: "", price: null, inStock: true, brand: null, pack: null }],
    )
    expect(high.confidence).toBe(1)

    mockState.responseText = '{"bestIdx": 0, "confidence": -0.5, "reasoning": "x"}'
    const low = await matchMaterial(
      { description: "x", unit: "ea", quantity: 1 },
      [{ title: "a", sku: "1", url: "", price: null, inStock: true, brand: null, pack: null }],
    )
    expect(low.confidence).toBe(0)
  })

  it("returns a safe fallback on Claude error (no throw)", async () => {
    mockState.shouldThrow = new Error("rate limited")
    const result = await matchMaterial(
      { description: "x", unit: "ea", quantity: 1 },
      [{ title: "a", sku: "1", url: "", price: null, inStock: true, brand: null, pack: null }],
    )
    expect(result.bestIdx).toBeNull()
    expect(result.confidence).toBe(0)
    expect(result.reasoning).toMatch(/rate limited|Claude/i)
  })

  it("returns null bestIdx on non-JSON Claude output", async () => {
    mockState.responseText = "I'm sorry I can't help with that"
    const result = await matchMaterial(
      { description: "x", unit: "ea", quantity: 1 },
      [{ title: "a", sku: "1", url: "", price: null, inStock: true, brand: null, pack: null }],
    )
    expect(result.bestIdx).toBeNull()
    expect(result.reasoning).toMatch(/non-JSON/i)
  })

  it("short-circuits with empty candidates (no SDK call)", async () => {
    const result = await matchMaterial(
      { description: "x", unit: "ea", quantity: 1 },
      [],
    )
    expect(result.bestIdx).toBeNull()
    expect(result.confidence).toBe(0)
  })

  it("short-circuits when ANTHROPIC_API_KEY is missing", async () => {
    delete process.env.ANTHROPIC_API_KEY
    const result = await matchMaterial(
      { description: "x", unit: "ea", quantity: 1 },
      [{ title: "a", sku: "1", url: "", price: null, inStock: true, brand: null, pack: null }],
    )
    expect(result.bestIdx).toBeNull()
    expect(result.reasoning).toMatch(/ANTHROPIC_API_KEY/i)
  })
})

describe("findAlternatives — mocked SDK", () => {
  const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY

  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test-key"
    mockState.shouldThrow = null
    mockState.responseText = '{"ranked": []}'
  })

  afterEach(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY
  })

  it("returns ranked alternatives, capped at 3, in given order", async () => {
    mockState.responseText = JSON.stringify({
      ranked: [
        { idx: 1, confidence: 0.8, reasoning: "Same brand, larger pack" },
        { idx: 0, confidence: 0.6, reasoning: "Same job, different brand" },
        { idx: 2, confidence: 0.4, reasoning: "Generic equivalent" },
        { idx: 3, confidence: 0.3, reasoning: "Should be dropped — over cap" },
      ],
    })
    const result = await findAlternatives(
      { description: "x", unit: "ea", quantity: 1 },
      { title: "OOS one", sku: "0", url: "", price: 5, inStock: false, brand: null, pack: null },
      [
        { title: "alt1", sku: "1", url: "", price: 5, inStock: true, brand: null, pack: null },
        { title: "alt2", sku: "2", url: "", price: 6, inStock: true, brand: null, pack: null },
        { title: "alt3", sku: "3", url: "", price: 7, inStock: true, brand: null, pack: null },
        { title: "alt4", sku: "4", url: "", price: 8, inStock: true, brand: null, pack: null },
      ],
    )
    expect(result.ranked).toHaveLength(3)
    expect(result.ranked[0]).toMatchObject({ idx: 1, confidence: 0.8 })
  })

  it("drops invalid indices silently", async () => {
    mockState.responseText = JSON.stringify({
      ranked: [
        { idx: 99, confidence: 0.5, reasoning: "Invalid" },
        { idx: 0, confidence: 0.7, reasoning: "Valid" },
      ],
    })
    const result = await findAlternatives(
      { description: "x", unit: "ea", quantity: 1 },
      { title: "OOS", sku: "0", url: "", price: null, inStock: false, brand: null, pack: null },
      [
        { title: "alt", sku: "1", url: "", price: null, inStock: true, brand: null, pack: null },
      ],
    )
    expect(result.ranked).toHaveLength(1)
    expect(result.ranked[0].idx).toBe(0)
  })

  it("returns empty ranked on empty alternatives (no SDK call)", async () => {
    const result = await findAlternatives(
      { description: "x", unit: "ea", quantity: 1 },
      { title: "OOS", sku: "0", url: "", price: null, inStock: false, brand: null, pack: null },
      [],
    )
    expect(result.ranked).toEqual([])
  })

  it("returns empty on Claude error (no throw)", async () => {
    mockState.shouldThrow = new Error("network")
    const result = await findAlternatives(
      { description: "x", unit: "ea", quantity: 1 },
      { title: "OOS", sku: "0", url: "", price: null, inStock: false, brand: null, pack: null },
      [{ title: "alt", sku: "1", url: "", price: null, inStock: true, brand: null, pack: null }],
    )
    expect(result.ranked).toEqual([])
  })
})
