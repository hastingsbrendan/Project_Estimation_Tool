/**
 * Aggregate a project's line items into a material list.
 * Groups by (description, unit) — sums quantities and computes
 * estimated subtotal. Labor lines are excluded.
 *
 * Optional `hdSku` flows through when the line item carries a catalogItemId
 * that resolves to a known SKU. If multiple line items in the same bucket
 * have *different* SKUs, we drop the SKU rather than guess wrong — the
 * cart-builder treats null as "fall back to text search."
 */

export type LineItemForMaterials = {
  description: string
  quantity: number
  unit: string
  unitPrice: number
  kind: string
  /** Looked up from the line item's catalogItemId if available. */
  hdSku?: string | null
}

export type MaterialRow = {
  description: string
  unit: string
  quantity: number
  estUnitPrice: number // weighted average if same desc had different prices
  estSubtotal: number
  /** Home Depot SKU when the bucket resolves to a single known SKU. */
  hdSku: string | null
}

export function aggregateMaterials(
  items: LineItemForMaterials[],
): MaterialRow[] {
  const buckets = new Map<
    string,
    {
      description: string
      unit: string
      quantity: number
      subtotal: number
      skus: Set<string>
    }
  >()

  for (const li of items) {
    if (li.kind !== "material") continue
    const key = `${li.description.trim().toLowerCase()}::${li.unit.trim().toLowerCase()}`
    const cur = buckets.get(key)
    if (!cur) {
      const skus = new Set<string>()
      if (li.hdSku) skus.add(li.hdSku)
      buckets.set(key, {
        description: li.description,
        unit: li.unit,
        quantity: li.quantity,
        subtotal: li.quantity * li.unitPrice,
        skus,
      })
    } else {
      cur.quantity += li.quantity
      cur.subtotal += li.quantity * li.unitPrice
      if (li.hdSku) cur.skus.add(li.hdSku)
    }
  }

  const rows: MaterialRow[] = []
  for (const b of buckets.values()) {
    const estUnitPrice = b.quantity > 0 ? b.subtotal / b.quantity : 0
    // Only surface a SKU when the entire bucket agrees on one. Mixed
    // SKUs in the same description+unit bucket means the contractor
    // pulled the same line from different catalog rows; we don't have
    // a safe way to pick one, so we fall back to text search.
    const hdSku = b.skus.size === 1 ? [...b.skus][0]! : null
    rows.push({
      description: b.description,
      unit: b.unit,
      quantity: round2(b.quantity),
      estUnitPrice: round2(estUnitPrice),
      estSubtotal: round2(b.subtotal),
      hdSku,
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
