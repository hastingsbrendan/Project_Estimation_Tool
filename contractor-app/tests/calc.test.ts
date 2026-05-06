import { describe, it, expect } from "vitest"
import { calcEstimate, lineItemTotal, formatCurrency, type CalcLineItem } from "../lib/calc"

const material = (quantity: number, unitPrice: number): CalcLineItem => ({
  quantity,
  unitPrice,
  kind: "material",
})
const labor = (quantity: number, unitPrice: number): CalcLineItem => ({
  quantity,
  unitPrice,
  kind: "labor",
})

describe("lineItemTotal", () => {
  it("multiplies quantity by unit price", () => {
    expect(lineItemTotal({ quantity: 3, unitPrice: 12.5 })).toBe(37.5)
  })

  it("rounds to cents", () => {
    expect(lineItemTotal({ quantity: 3, unitPrice: 0.1 })).toBe(0.3)
    expect(lineItemTotal({ quantity: 7, unitPrice: 0.15 })).toBe(1.05)
  })

  it("returns 0 for zero quantity", () => {
    expect(lineItemTotal({ quantity: 0, unitPrice: 99.99 })).toBe(0)
  })
})

describe("calcEstimate — empty estimate", () => {
  it("returns all zeros for no line items", () => {
    const result = calcEstimate({ lineItems: [], markupPct: 0, taxRate: 0 })
    expect(result).toEqual({
      materialSubtotal: 0,
      laborSubtotal: 0,
      subtotal: 0,
      markup: 0,
      tax: 0,
      total: 0,
    })
  })

  it("returns zero totals even with non-zero markup/tax", () => {
    const result = calcEstimate({ lineItems: [], markupPct: 25, taxRate: 8 })
    expect(result.total).toBe(0)
  })
})

describe("calcEstimate — single material line", () => {
  it("computes total with no markup or tax", () => {
    const result = calcEstimate({
      lineItems: [material(10, 5)],
      markupPct: 0,
      taxRate: 0,
    })
    expect(result.materialSubtotal).toBe(50)
    expect(result.laborSubtotal).toBe(0)
    expect(result.subtotal).toBe(50)
    expect(result.total).toBe(50)
  })

  it("applies tax to materials", () => {
    const result = calcEstimate({
      lineItems: [material(10, 100)],
      markupPct: 0,
      taxRate: 8.25,
    })
    expect(result.materialSubtotal).toBe(1000)
    expect(result.tax).toBe(82.5)
    expect(result.total).toBe(1082.5)
  })
})

describe("calcEstimate — single labor line", () => {
  it("does NOT apply tax to labor", () => {
    const result = calcEstimate({
      lineItems: [labor(8, 75)],
      markupPct: 0,
      taxRate: 8.25,
    })
    expect(result.laborSubtotal).toBe(600)
    expect(result.tax).toBe(0)
    expect(result.total).toBe(600)
  })
})

describe("calcEstimate — markup", () => {
  it("applies 20% markup to subtotal", () => {
    const result = calcEstimate({
      lineItems: [material(1, 1000)],
      markupPct: 20,
      taxRate: 0,
    })
    expect(result.markup).toBe(200)
    expect(result.total).toBe(1200)
  })

  it("applies 100% markup", () => {
    const result = calcEstimate({
      lineItems: [labor(1, 500)],
      markupPct: 100,
      taxRate: 0,
    })
    expect(result.markup).toBe(500)
    expect(result.total).toBe(1000)
  })

  it("clamps negative markup to 0", () => {
    const result = calcEstimate({
      lineItems: [material(1, 100)],
      markupPct: -50,
      taxRate: 0,
    })
    expect(result.markup).toBe(0)
    expect(result.total).toBe(100)
  })

  it("ignores NaN markup", () => {
    const result = calcEstimate({
      lineItems: [material(1, 100)],
      markupPct: Number.NaN,
      taxRate: 0,
    })
    expect(result.markup).toBe(0)
  })
})

describe("calcEstimate — mixed material + labor", () => {
  it("handles a typical kitchen estimate", () => {
    const result = calcEstimate({
      lineItems: [
        material(40, 12), //  $480 cabinet hardware
        material(80, 8.5), // $680 trim
        labor(16, 65), //    $1040 labor
        labor(8, 85), //     $680 labor
      ],
      markupPct: 15,
      taxRate: 7,
    })
    expect(result.materialSubtotal).toBe(1160)
    expect(result.laborSubtotal).toBe(1720)
    expect(result.subtotal).toBe(2880)
    expect(result.markup).toBe(432) // 15% of 2880
    expect(result.tax).toBe(81.2) //   7% of 1160
    expect(result.total).toBe(3393.2)
  })
})

describe("calcEstimate — rounding", () => {
  it("handles awkward floating-point amounts cleanly", () => {
    // 3 × 0.10 = 0.30000000000000004 in JS without rounding
    const result = calcEstimate({
      lineItems: [material(3, 0.1)],
      markupPct: 0,
      taxRate: 0,
    })
    expect(result.materialSubtotal).toBe(0.3)
    expect(result.total).toBe(0.3)
  })

  it("rounds tax to cents", () => {
    const result = calcEstimate({
      lineItems: [material(1, 99.99)],
      markupPct: 0,
      taxRate: 8.25,
    })
    expect(result.tax).toBe(8.25) // 99.99 × 0.0825 = 8.249175 → 8.25
  })
})

describe("calcEstimate — Excel cross-check", () => {
  it("matches a hand-computed bathroom remodel", () => {
    // Scope: tile, fixtures, plumbing labor
    // Materials: 60 sqft tile @ $4.50, 1 toilet @ $250, 1 vanity @ $620
    // Labor: 24 hr @ $80
    // Markup: 18%, Tax (materials): 6.5%
    const result = calcEstimate({
      lineItems: [
        material(60, 4.5), // 270
        material(1, 250), // 250
        material(1, 620), // 620
        labor(24, 80), //    1920
      ],
      markupPct: 18,
      taxRate: 6.5,
    })
    expect(result.materialSubtotal).toBe(1140)
    expect(result.laborSubtotal).toBe(1920)
    expect(result.subtotal).toBe(3060)
    expect(result.markup).toBe(550.8) // 18% × 3060
    expect(result.tax).toBe(74.1) //    6.5% × 1140
    expect(result.total).toBe(3684.9)
  })
})

describe("formatCurrency", () => {
  it("formats whole dollars", () => {
    expect(formatCurrency(50)).toBe("$50.00")
  })

  it("formats with thousands separator", () => {
    expect(formatCurrency(12345.67)).toBe("$12,345.67")
  })

  it("formats zero", () => {
    expect(formatCurrency(0)).toBe("$0.00")
  })
})
