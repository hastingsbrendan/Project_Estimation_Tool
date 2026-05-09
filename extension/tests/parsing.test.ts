import { describe, it, expect } from "vitest"
import {
  parsePrice,
  extractPack,
  searchUrlFor,
  isPdpUrl,
} from "../src/shared/parsing"
import type { Material } from "../src/shared/types"

const baseMaterial: Material = {
  description: "Drywall sheet 4x8 1/2 inch",
  unit: "sheet",
  quantity: 5,
  estUnitPrice: 13.99,
  estSubtotal: 69.95,
  hdSku: null,
  notes: null,
}

describe("searchUrlFor", () => {
  it("uses the SKU when present", () => {
    expect(searchUrlFor({ ...baseMaterial, hdSku: "100075069" })).toBe(
      "https://www.homedepot.com/s/100075069",
    )
  })

  it("falls back to description when SKU is null", () => {
    expect(searchUrlFor(baseMaterial)).toBe(
      "https://www.homedepot.com/s/Drywall%20sheet%204x8%201%2F2%20inch",
    )
  })

  it("treats whitespace-only SKU as missing", () => {
    expect(searchUrlFor({ ...baseMaterial, hdSku: "   " })).toBe(
      "https://www.homedepot.com/s/Drywall%20sheet%204x8%201%2F2%20inch",
    )
  })

  it("trims surrounding whitespace on the SKU before encoding", () => {
    expect(searchUrlFor({ ...baseMaterial, hdSku: "  100075069 " })).toBe(
      "https://www.homedepot.com/s/100075069",
    )
  })

  it("URL-encodes special characters in description fallback", () => {
    expect(
      searchUrlFor({ ...baseMaterial, description: "1x4 pine 8' S4S" }),
    ).toBe("https://www.homedepot.com/s/1x4%20pine%208'%20S4S")
  })
})

describe("parsePrice", () => {
  it("parses a $-prefixed price", () => {
    expect(parsePrice("$12.99")).toBe(12.99)
  })

  it("parses a bare numeric price", () => {
    expect(parsePrice("12.99")).toBe(12.99)
  })

  it("strips comma thousands-separators", () => {
    expect(parsePrice("$1,234.56")).toBe(1234.56)
  })

  it("returns the first dollar amount when there are several", () => {
    // HD sometimes shows "Was $19.99 Now $14.99" — we want the first
    // visible price, which by HD convention is the one displayed
    // largest (and what the scraper passed in via the .price-format
    // selector).
    expect(parsePrice("$14.99 was $19.99")).toBe(14.99)
  })

  it("returns null for empty / nonsense / no digits", () => {
    expect(parsePrice("")).toBeNull()
    expect(parsePrice("Add to cart")).toBeNull()
    expect(parsePrice("$.")).toBeNull()
  })

  it("survives whitespace around the digits", () => {
    expect(parsePrice("  $  9.49  ")).toBe(9.49)
  })
})

describe("extractPack", () => {
  it("matches 'Pack of N'", () => {
    expect(extractPack("Drywall Screws (Pack of 50)")).toMatch(/pack of 50/i)
  })

  it("matches 'N-pack'", () => {
    expect(extractPack("Roller Cover 9 in 3-pack")).toMatch(/3.*pack/i)
  })

  it("matches 'N pk' / 'N ct' / 'N lb' / 'N oz' / 'N gal'", () => {
    expect(extractPack("Caulk 10 oz tube")).toMatch(/10 oz/i)
    expect(extractPack("Joint compound 5 gal")).toMatch(/5 gal/i)
    expect(extractPack("Drywall screws 5 lb")).toMatch(/5 lb/i)
    expect(extractPack("Tile spacers 200 ct")).toMatch(/200 ct/i)
    expect(extractPack("Pencils 12 pk")).toMatch(/12 pk/i)
  })

  it("returns null when no pack-size signal is present", () => {
    expect(extractPack("2x4 stud, 8ft, SPF")).toBeNull()
    expect(extractPack("Drywall sheet 4x8 1/2 inch")).toBeNull()
  })
})

describe("isPdpUrl", () => {
  it("recognizes /p/<slug>/<id> permalinks", () => {
    expect(
      isPdpUrl("/p/USG-Sheetrock-UltraLight-1-2-in-x-4-ft-x-8-ft/100075069"),
    ).toBe(true)
  })

  it("recognizes the bare /p/<id> shape", () => {
    expect(isPdpUrl("/p/100075069")).toBe(false) // requires slug + id
    expect(isPdpUrl("/p/x/100075069")).toBe(true)
  })

  it("rejects search-results pages and non-product paths", () => {
    expect(isPdpUrl("/s/drywall")).toBe(false)
    expect(isPdpUrl("/c/Building-Materials")).toBe(false)
    expect(isPdpUrl("/cart")).toBe(false)
    expect(isPdpUrl("/")).toBe(false)
  })
})
