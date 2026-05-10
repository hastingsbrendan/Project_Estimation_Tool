import { describe, it, expect } from "vitest"
import {
  readCandidate,
  parseMatchMaterialBody,
  parseFindAlternativeBody,
  MAX_CANDIDATES,
  MAX_ALTS,
} from "../lib/api-v1/parsers"

/**
 * The /api/v1/* endpoints are external API surface — anyone (including
 * a future CLI / mobile client) can hit them. These tests pin the
 * validation contract; a regression here breaks every consumer of
 * the API silently.
 *
 * Keep these tests focused on the input/output shape, not on what
 * the matcher does downstream — that's covered by material-matcher.test.ts.
 */

const sampleMaterial = {
  description: "Drywall sheet 4x8 1/2 inch",
  unit: "sheet",
  quantity: 5,
  notes: null,
}

const sampleCandidate = {
  title: "USG Sheetrock UltraLight 1/2 in. x 4 ft. x 8 ft.",
  sku: "100075069",
  url: "https://www.homedepot.com/p/USG-Sheetrock/100075069",
  price: 13.99,
  inStock: true,
  brand: "USG",
  pack: null,
}

describe("readCandidate", () => {
  it("returns a normalized Candidate for a valid input", () => {
    const c = readCandidate(sampleCandidate)
    expect(c).not.toBeNull()
    expect(c?.title).toBe(sampleCandidate.title)
    expect(c?.sku).toBe("100075069")
  })

  it("returns null when title is missing or empty", () => {
    expect(readCandidate({ ...sampleCandidate, title: "" })).toBeNull()
    expect(readCandidate({ ...sampleCandidate, title: "   " })).toBeNull()
    expect(readCandidate({ ...sampleCandidate, title: 123 })).toBeNull()
    expect(readCandidate({ sku: "x" })).toBeNull()
  })

  it("trims surrounding whitespace on title", () => {
    expect(readCandidate({ ...sampleCandidate, title: "  Drywall  " })?.title).toBe(
      "Drywall",
    )
  })

  it("coerces missing optional fields to safe defaults", () => {
    const c = readCandidate({ title: "Drywall" })
    expect(c).toEqual({
      title: "Drywall",
      sku: "",
      url: "",
      price: null,
      inStock: false,
      brand: null,
      pack: null,
    })
  })

  it("only treats inStock=true literal as in-stock", () => {
    // Defensive: a caller that passes "true" or 1 shouldn't accidentally
    // mark the candidate in-stock. Strict equality.
    expect(readCandidate({ title: "x", inStock: "true" })?.inStock).toBe(false)
    expect(readCandidate({ title: "x", inStock: 1 })?.inStock).toBe(false)
    expect(readCandidate({ title: "x", inStock: true })?.inStock).toBe(true)
  })

  it("returns null for non-objects", () => {
    expect(readCandidate(null)).toBeNull()
    expect(readCandidate(undefined)).toBeNull()
    expect(readCandidate("a string")).toBeNull()
    expect(readCandidate(42)).toBeNull()
  })
})

describe("parseMatchMaterialBody", () => {
  it("accepts a well-formed request", () => {
    const r = parseMatchMaterialBody({
      material: sampleMaterial,
      candidates: [sampleCandidate],
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.material.description).toBe(sampleMaterial.description)
      expect(r.candidates).toHaveLength(1)
    }
  })

  it("rejects non-object body", () => {
    const r = parseMatchMaterialBody(null)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/bad body/i)
  })

  it("rejects missing material", () => {
    expect(
      parseMatchMaterialBody({ candidates: [sampleCandidate] }),
    ).toMatchObject({ ok: false, error: /material/i })
  })

  it("rejects missing material.description", () => {
    expect(
      parseMatchMaterialBody({
        material: { unit: "ea", quantity: 1 },
        candidates: [sampleCandidate],
      }),
    ).toMatchObject({ ok: false, error: /description/i })
  })

  it("rejects missing material.unit", () => {
    expect(
      parseMatchMaterialBody({
        material: { description: "x", quantity: 1 },
        candidates: [sampleCandidate],
      }),
    ).toMatchObject({ ok: false, error: /unit/i })
  })

  it("rejects missing or empty candidates array", () => {
    expect(
      parseMatchMaterialBody({ material: sampleMaterial }),
    ).toMatchObject({ ok: false, error: /array/i })
    expect(
      parseMatchMaterialBody({ material: sampleMaterial, candidates: [] }),
    ).toMatchObject({ ok: false, error: /non-empty/i })
  })

  it("rejects when no candidates have valid titles after filtering", () => {
    expect(
      parseMatchMaterialBody({
        material: sampleMaterial,
        candidates: [{}, { title: "" }, { title: "   " }],
      }),
    ).toMatchObject({ ok: false, error: /No valid candidates/i })
  })

  it("caps candidates at MAX_CANDIDATES (defense-in-depth on prompt cost)", () => {
    const many = Array.from({ length: MAX_CANDIDATES + 5 }, (_, i) => ({
      ...sampleCandidate,
      title: `Cand ${i}`,
    }))
    const r = parseMatchMaterialBody({ material: sampleMaterial, candidates: many })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.candidates).toHaveLength(MAX_CANDIDATES)
  })

  it("defaults invalid quantity to 1", () => {
    const r = parseMatchMaterialBody({
      material: { ...sampleMaterial, quantity: -3 },
      candidates: [sampleCandidate],
    })
    if (r.ok) expect(r.material.quantity).toBe(1)
  })

  it("filters non-object candidates rather than throwing", () => {
    const r = parseMatchMaterialBody({
      material: sampleMaterial,
      candidates: [sampleCandidate, null, "garbage", { no: "title" }],
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.candidates).toHaveLength(1)
  })
})

describe("parseFindAlternativeBody", () => {
  it("accepts a well-formed request with non-empty alternatives", () => {
    const r = parseFindAlternativeBody({
      material: sampleMaterial,
      oosCandidate: sampleCandidate,
      alternatives: [sampleCandidate],
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.alternatives).toHaveLength(1)
      expect(r.oosCandidate.sku).toBe("100075069")
    }
  })

  it("accepts empty alternatives array (caller still gets ranked: [])", () => {
    // Per the plan, the user must explicitly pick a substitute; an
    // empty alternatives list is a valid "we couldn't find any" signal.
    const r = parseFindAlternativeBody({
      material: sampleMaterial,
      oosCandidate: sampleCandidate,
      alternatives: [],
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.alternatives).toEqual([])
  })

  it("rejects missing oosCandidate", () => {
    expect(
      parseFindAlternativeBody({
        material: sampleMaterial,
        alternatives: [sampleCandidate],
      }),
    ).toMatchObject({ ok: false, error: /oosCandidate/i })
  })

  it("rejects unparseable oosCandidate (no title)", () => {
    expect(
      parseFindAlternativeBody({
        material: sampleMaterial,
        oosCandidate: { sku: "x" },
        alternatives: [],
      }),
    ).toMatchObject({ ok: false, error: /oosCandidate/i })
  })

  it("rejects missing alternatives array", () => {
    expect(
      parseFindAlternativeBody({
        material: sampleMaterial,
        oosCandidate: sampleCandidate,
      }),
    ).toMatchObject({ ok: false, error: /array/i })
  })

  it("caps alternatives at MAX_ALTS", () => {
    const many = Array.from({ length: MAX_ALTS + 3 }, (_, i) => ({
      ...sampleCandidate,
      title: `Alt ${i}`,
    }))
    const r = parseFindAlternativeBody({
      material: sampleMaterial,
      oosCandidate: sampleCandidate,
      alternatives: many,
    })
    if (r.ok) expect(r.alternatives).toHaveLength(MAX_ALTS)
  })

  it("filters out invalid alternative entries silently", () => {
    const r = parseFindAlternativeBody({
      material: sampleMaterial,
      oosCandidate: sampleCandidate,
      alternatives: [sampleCandidate, null, { title: "" }, sampleCandidate],
    })
    if (r.ok) expect(r.alternatives).toHaveLength(2)
  })
})
