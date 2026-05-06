/**
 * Pure pricing engine for contractor estimates.
 *
 * Heavily tested in tests/calc.test.ts. Keep this module side-effect free
 * (no database, no I/O) so it can be reused on the client and in PDF generation.
 */

export type LineItemKind = "material" | "labor"

export type CalcLineItem = {
  quantity: number
  unitPrice: number
  kind: LineItemKind
}

export type CalcInput = {
  lineItems: CalcLineItem[]
  /** Markup percentage applied to subtotal (0–100). */
  markupPct: number
  /** Tax percentage applied to materials only (0–100). */
  taxRate: number
}

export type CalcResult = {
  /** Sum of all material line items, before markup/tax. */
  materialSubtotal: number
  /** Sum of all labor line items, before markup/tax. */
  laborSubtotal: number
  /** materialSubtotal + laborSubtotal. */
  subtotal: number
  /** Markup amount (subtotal × markupPct/100). */
  markup: number
  /** Tax amount (materialSubtotal × taxRate/100). */
  tax: number
  /** Final client-facing total: subtotal + markup + tax. */
  total: number
}

/** Round to 2 decimal places (cents). */
function round2(n: number): number {
  // Avoid floating-point drift via Number.EPSILON nudge
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** Total for a single line item (quantity × unitPrice), rounded to cents. */
export function lineItemTotal(item: Pick<CalcLineItem, "quantity" | "unitPrice">): number {
  return round2(item.quantity * item.unitPrice)
}

export function calcEstimate(input: CalcInput): CalcResult {
  const materialSubtotal = round2(
    input.lineItems
      .filter((i) => i.kind === "material")
      .reduce((sum, i) => sum + i.quantity * i.unitPrice, 0),
  )
  const laborSubtotal = round2(
    input.lineItems
      .filter((i) => i.kind === "labor")
      .reduce((sum, i) => sum + i.quantity * i.unitPrice, 0),
  )
  const subtotal = round2(materialSubtotal + laborSubtotal)

  const markupPct = clampPct(input.markupPct)
  const taxRate = clampPct(input.taxRate)

  const markup = round2(subtotal * (markupPct / 100))
  const tax = round2(materialSubtotal * (taxRate / 100))
  const total = round2(subtotal + markup + tax)

  return { materialSubtotal, laborSubtotal, subtotal, markup, tax, total }
}

/**
 * Clamp a percentage to [0, 1000]. Negative values become 0; we cap at
 * 1000% to catch obviously-bad input but allow extreme markup (e.g. 200%).
 */
function clampPct(p: number): number {
  if (Number.isNaN(p) || !Number.isFinite(p)) return 0
  if (p < 0) return 0
  if (p > 1000) return 1000
  return p
}

/** Format a number as USD currency. */
export function formatCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n)
}
