/**
 * Aggregate a project's line items into a material list.
 * Groups by (description, unit) — sums quantities and computes
 * estimated subtotal. Labor lines are excluded.
 */

export type LineItemForMaterials = {
  description: string
  quantity: number
  unit: string
  unitPrice: number
  kind: string
}

export type MaterialRow = {
  description: string
  unit: string
  quantity: number
  estUnitPrice: number // weighted average if same desc had different prices
  estSubtotal: number
}

export function aggregateMaterials(
  items: LineItemForMaterials[],
): MaterialRow[] {
  const buckets = new Map<
    string,
    { description: string; unit: string; quantity: number; subtotal: number }
  >()

  for (const li of items) {
    if (li.kind !== "material") continue
    const key = `${li.description.trim().toLowerCase()}::${li.unit.trim().toLowerCase()}`
    const cur = buckets.get(key)
    if (!cur) {
      buckets.set(key, {
        description: li.description,
        unit: li.unit,
        quantity: li.quantity,
        subtotal: li.quantity * li.unitPrice,
      })
    } else {
      cur.quantity += li.quantity
      cur.subtotal += li.quantity * li.unitPrice
    }
  }

  const rows: MaterialRow[] = []
  for (const b of buckets.values()) {
    const estUnitPrice = b.quantity > 0 ? b.subtotal / b.quantity : 0
    rows.push({
      description: b.description,
      unit: b.unit,
      quantity: round2(b.quantity),
      estUnitPrice: round2(estUnitPrice),
      estSubtotal: round2(b.subtotal),
    })
  }
  rows.sort((a, b) => a.description.localeCompare(b.description))
  return rows
}

export function materialsTotal(rows: MaterialRow[]): number {
  return round2(rows.reduce((sum, r) => sum + r.estSubtotal, 0))
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
