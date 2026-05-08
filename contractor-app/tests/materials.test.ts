import { describe, it, expect } from "vitest"
import { aggregateMaterials, materialsTotal } from "../lib/materials"

const m = (description: string, quantity: number, unitPrice: number, unit = "ea") => ({
  description,
  quantity,
  unitPrice,
  unit,
  kind: "material",
})
const labor = (description: string, quantity: number, unitPrice: number) => ({
  description,
  quantity,
  unitPrice,
  unit: "hr",
  kind: "labor",
})

describe("aggregateMaterials", () => {
  it("returns empty array for no items", () => {
    expect(aggregateMaterials([])).toEqual([])
  })

  it("excludes labor lines", () => {
    const rows = aggregateMaterials([labor("Demo", 8, 75), m("Drywall", 5, 12)])
    expect(rows).toHaveLength(1)
    expect(rows[0].description).toBe("Drywall")
  })

  it("groups identical (description, unit) lines and sums quantities", () => {
    const rows = aggregateMaterials([
      m("2x4 stud", 10, 4),
      m("2x4 stud", 5, 4),
      m("2x4 stud", 15, 4.5),
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0].quantity).toBe(30)
    expect(rows[0].estSubtotal).toBe(127.5) // 10*4 + 5*4 + 15*4.5
  })

  it("treats different units as separate rows", () => {
    const rows = aggregateMaterials([
      m("Pipe", 10, 5, "ft"),
      m("Pipe", 2, 60, "ea"),
    ])
    expect(rows).toHaveLength(2)
  })

  it("computes weighted average unit price across grouped rows", () => {
    const rows = aggregateMaterials([
      m("Tile", 60, 4),
      m("Tile", 40, 6),
    ])
    expect(rows[0].quantity).toBe(100)
    expect(rows[0].estSubtotal).toBe(480) // 240 + 240
    expect(rows[0].estUnitPrice).toBe(4.8) // 480 / 100
  })

  it("is case- and whitespace-insensitive when grouping", () => {
    const rows = aggregateMaterials([
      m("  Drywall  ", 5, 10),
      m("DRYWALL", 3, 10),
      m("drywall", 2, 10),
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0].quantity).toBe(10)
  })

  it("sorts results alphabetically by description", () => {
    const rows = aggregateMaterials([
      m("Zinc strip", 1, 5),
      m("Adhesive", 1, 8),
      m("Mortar", 1, 12),
    ])
    expect(rows.map((r) => r.description)).toEqual([
      "Adhesive",
      "Mortar",
      "Zinc strip",
    ])
  })
})

describe("materialsTotal", () => {
  it("sums estSubtotals", () => {
    const rows = aggregateMaterials([m("a", 2, 5), m("b", 3, 4)])
    expect(materialsTotal(rows)).toBe(22) // 10 + 12
  })

  it("returns 0 for empty list", () => {
    expect(materialsTotal([])).toBe(0)
  })
})
