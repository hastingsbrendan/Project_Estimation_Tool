import { describe, it, expect } from "vitest"
import { coerceDraft, __test } from "../lib/ai/walkthrough-drafter"

const VALID_IDS = new Set(["cat-1", "cat-2"])

describe("coerceDraft", () => {
  it("accepts a well-formed draft and preserves catalog links", () => {
    const out = coerceDraft(
      {
        sections: [
          {
            name: "Kitchen",
            items: [
              {
                description: "Demo tile floor",
                quantity: 120,
                unit: "sqft",
                unitPrice: 4.5,
                kind: "labor",
                catalogItemId: "cat-1",
              },
            ],
          },
        ],
        notes: "Check ceiling height",
      },
      VALID_IDS,
    )
    expect(out?.sections).toHaveLength(1)
    expect(out?.sections[0]!.items[0]!.catalogItemId).toBe("cat-1")
    expect(out?.notes).toBe("Check ceiling height")
  })

  it("clears hallucinated catalogItemIds instead of failing", () => {
    const out = coerceDraft(
      {
        sections: [
          {
            name: "Bath",
            items: [
              {
                description: "Custom shower niche",
                quantity: 1,
                unit: "ea",
                unitPrice: 0,
                kind: "labor",
                catalogItemId: "made-up-id",
              },
            ],
          },
        ],
        notes: null,
      },
      VALID_IDS,
    )
    expect(out?.sections[0]!.items[0]!.catalogItemId).toBeNull()
  })

  it("coerces invalid quantity/price/kind to safe defaults", () => {
    const out = coerceDraft(
      {
        sections: [
          {
            name: "Misc",
            items: [
              {
                description: "Thing",
                quantity: -5,
                unit: "",
                unitPrice: "not-a-number",
                kind: "robot",
                catalogItemId: null,
              },
            ],
          },
        ],
      },
      VALID_IDS,
    )
    const item = out?.sections[0]!.items[0]!
    expect(item?.quantity).toBe(1)
    expect(item?.unit).toBe("ea")
    expect(item?.unitPrice).toBe(0)
    expect(item?.kind).toBe("material")
  })

  it("drops malformed items + empty sections, keeps the rest", () => {
    const out = coerceDraft(
      {
        sections: [
          { name: "Good", items: [{ description: "X", quantity: 1, unit: "ea", unitPrice: 1, kind: "material" }] },
          { name: "All bad", items: [{ noDescription: true }, null, "junk"] },
          { name: "", items: [{ description: "orphan", quantity: 1, unit: "ea", unitPrice: 1, kind: "material" }] },
        ],
        notes: "   ",
      },
      VALID_IDS,
    )
    expect(out?.sections).toHaveLength(1)
    expect(out?.sections[0]!.name).toBe("Good")
    expect(out?.notes).toBeNull()
  })

  it("returns null for non-object / missing sections", () => {
    expect(coerceDraft(null, VALID_IDS)).toBeNull()
    expect(coerceDraft("text", VALID_IDS)).toBeNull()
    expect(coerceDraft({ notes: "hi" }, VALID_IDS)).toBeNull()
  })
})

describe("parseJsonObjectFromText", () => {
  const { parseJsonObjectFromText } = __test
  it("parses bare JSON and fenced JSON", () => {
    expect(parseJsonObjectFromText('{"a":1}')).toEqual({ a: 1 })
    expect(parseJsonObjectFromText('```json\n{"a":1}\n```')).toEqual({ a: 1 })
  })
  it("recovers an object embedded in prose", () => {
    expect(
      parseJsonObjectFromText('Here is your draft: {"sections":[],"notes":null} hope it helps'),
    ).toEqual({ sections: [], notes: null })
  })
  it("returns null for garbage", () => {
    expect(parseJsonObjectFromText("no json here")).toBeNull()
  })
})

describe("buildPrompt", () => {
  it("includes catalog rows and the transcript", () => {
    const prompt = __test.buildPrompt("tear out the kitchen floor", [
      { id: "cat-1", description: "Demo tile floor", unit: "sqft", unitPrice: 4.5, kind: "labor" },
    ])
    expect(prompt).toContain("cat-1 | labor | Demo tile floor | sqft | $4.50")
    expect(prompt).toContain("tear out the kitchen floor")
  })
})
