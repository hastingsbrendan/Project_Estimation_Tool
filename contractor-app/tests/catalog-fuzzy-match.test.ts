import { describe, it, expect } from "vitest"
import {
  normalizeDescription,
  trigrams,
  trigramJaccard,
  scoreAgainstCatalog,
  bucketize,
  THRESHOLDS,
} from "../lib/catalog/fuzzy-match"

describe("normalizeDescription", () => {
  it("lowercases and strips punctuation", () => {
    expect(normalizeDescription("2x4 Stud, 8ft (SPF)")).toBe("2x4 stud 8ft spf")
  })

  it("collapses whitespace", () => {
    expect(normalizeDescription("  drywall   sheet  ")).toBe("drywall sheet")
  })

  it("returns empty string for whitespace-only input", () => {
    expect(normalizeDescription("   ")).toBe("")
  })
})

describe("trigrams", () => {
  it("emits padded character trigrams", () => {
    const t = trigrams("ab")
    // "  ab  " → "  a", " ab", "ab ", "b  "
    expect(t.has("  a")).toBe(true)
    expect(t.has(" ab")).toBe(true)
    expect(t.has("ab ")).toBe(true)
    expect(t.has("b  ")).toBe(true)
  })

  it("collapses duplicates into a Set", () => {
    expect(trigrams("aaa").size).toBeLessThan("  aaa  ".length)
  })
})

describe("trigramJaccard", () => {
  it("returns 1 for identical strings", () => {
    expect(trigramJaccard("drywall sheet", "drywall sheet")).toBe(1)
  })

  it("returns 1 after equivalent normalization", () => {
    expect(trigramJaccard("Drywall Sheet!", "drywall sheet")).toBe(1)
  })

  it("returns 0 for empty input", () => {
    expect(trigramJaccard("", "drywall")).toBe(0)
    expect(trigramJaccard("drywall", "")).toBe(0)
  })

  it("scores higher for closer strings", () => {
    const close = trigramJaccard("2x4 stud 8ft spf", "2x4 stud 8 ft spf")
    const far = trigramJaccard("2x4 stud 8ft spf", "tile 12x12 ceramic")
    expect(close).toBeGreaterThan(far)
    expect(close).toBeGreaterThan(0.7)
    expect(far).toBeLessThan(0.2)
  })

  it("captures abbreviation tolerance", () => {
    // "Drywall Sheet 1/2 inch" vs "Drywall sheet 1 2 in"
    const score = trigramJaccard("drywall sheet 1 2 inch", "drywall sheet 1 2 in")
    expect(score).toBeGreaterThan(0.7)
  })
})

describe("scoreAgainstCatalog", () => {
  const catalog = [
    { id: "drywall", description: "Drywall sheet 4x8 1/2 inch", unit: "sheet" },
    { id: "stud", description: "2x4 Stud, 8ft, SPF", unit: "ea" },
    { id: "screws", description: "Drywall screws 1-5/8 inch", unit: "lb" },
    { id: "tile", description: "Ceramic tile 12x12", unit: "sqft" },
  ]

  it("returns scores sorted descending", () => {
    const scores = scoreAgainstCatalog(
      { description: "Drywall sheet 4x8 1/2 in", unit: "sheet" },
      catalog,
    )
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i - 1].score).toBeGreaterThanOrEqual(scores[i].score)
    }
  })

  it("ranks the right candidate first for a near-exact match", () => {
    const scores = scoreAgainstCatalog(
      { description: "Drywall sheet 4x8 1/2 in", unit: "sheet" },
      catalog,
    )
    expect(scores[0].candidateId).toBe("drywall")
    expect(scores[0].score).toBeGreaterThan(THRESHOLDS.likely)
  })

  it("rewards exact unit match — same desc, different unit scores lower", () => {
    const matchingUnit = scoreAgainstCatalog(
      { description: "2x4 stud 8ft spf", unit: "ea" },
      catalog,
    )
    const wrongUnit = scoreAgainstCatalog(
      { description: "2x4 stud 8ft spf", unit: "lb" },
      catalog,
    )
    const studWithUnit = matchingUnit.find((s) => s.candidateId === "stud")!
    const studWrongUnit = wrongUnit.find((s) => s.candidateId === "stud")!
    expect(studWithUnit.score).toBeGreaterThan(studWrongUnit.score)
    expect(studWithUnit.unitMatch).toBe(true)
    expect(studWrongUnit.unitMatch).toBe(false)
  })

  it("scores a totally novel item below the uncertain threshold", () => {
    const scores = scoreAgainstCatalog(
      { description: "Stainless threaded rod 5/16 36 inch", unit: "ea" },
      catalog,
    )
    expect(scores[0].score).toBeLessThan(THRESHOLDS.uncertain)
  })
})

describe("bucketize", () => {
  it("≥0.8 → likely", () => {
    expect(bucketize(0.95)).toBe("likely")
    expect(bucketize(0.8)).toBe("likely")
  })

  it("0.5–0.8 → uncertain", () => {
    expect(bucketize(0.79)).toBe("uncertain")
    expect(bucketize(0.5)).toBe("uncertain")
  })

  it("<0.5 → new", () => {
    expect(bucketize(0.49)).toBe("new")
    expect(bucketize(0)).toBe("new")
  })
})
