/**
 * Parse a freeform payment-schedule string into milestone rows.
 *
 * Contractors write things like:
 *   "30% deposit, 40% rough-in, 30% final"
 *   "$2,000 deposit, balance on completion"
 *   "50% due at start; 50% on completion."
 *
 * Pure string parsing — no AI round-trip for something this regular.
 * Chunks split on commas / semicolons / newlines. Each chunk is matched
 * for a percentage (→ share of projectTotal) or a dollar amount.
 * "balance" / "remainder" / "rest" chunks get whatever is left.
 * Cent-rounding drift on percentage splits is folded into the LAST
 * milestone so the parts always sum exactly to the total.
 *
 * Unparseable chunks are skipped (never guessed); a fully unparseable
 * string returns [] and the UI falls back to manual entry.
 */

export type ParsedMilestone = {
  label: string
  amount: number
}

const PERCENT_RE = /(\d+(?:\.\d+)?)\s*%/
const DOLLAR_RE = /\$\s*([\d,]+(?:\.\d{1,2})?)/
const BALANCE_RE = /\b(balance|remainder|rest)\b/i

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** Strip the matched amount + connective filler, leaving a human label. */
function cleanLabel(chunk: string): string {
  const label = chunk
    .replace(PERCENT_RE, "")
    .replace(DOLLAR_RE, "")
    .replace(/\b(due|payable)\b/gi, "")
    .replace(/^\s*(at|on|upon|for|-|–|:)\s+/i, "")
    // Trailing connectives need a preceding space — `\s*on$` would eat
    // the tail of "completiON".
    .replace(/\s+(at|on|upon)\s*$/i, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s,.;:–-]+|[\s,.;:–-]+$/g, "")
    .trim()
  return label || "Payment"
}

export function parsePaymentSchedule(
  text: string | null | undefined,
  projectTotal: number,
): ParsedMilestone[] {
  if (!text || !text.trim()) return []

  // Split on semicolons/newlines always; commas only when NOT a
  // thousands separator ("$2,500" must stay one chunk).
  const chunks = text
    .split(/[;\n]+|,(?!\d)/)
    .map((c) => c.trim())
    .filter(Boolean)

  type Pending =
    | { kind: "amount"; label: string; amount: number }
    | { kind: "balance"; label: string }

  const pending: Pending[] = []
  for (const chunk of chunks) {
    const pct = chunk.match(PERCENT_RE)
    const dollars = chunk.match(DOLLAR_RE)
    if (pct) {
      const share = Number(pct[1]) / 100
      pending.push({
        kind: "amount",
        label: cleanLabel(chunk),
        amount: round2(projectTotal * share),
      })
    } else if (dollars) {
      pending.push({
        kind: "amount",
        label: cleanLabel(chunk),
        amount: round2(Number(dollars[1]!.replace(/,/g, ""))),
      })
    } else if (BALANCE_RE.test(chunk)) {
      pending.push({ kind: "balance", label: cleanLabel(chunk) })
    }
    // else: chunk has no recognizable amount — skip, never guess
  }

  if (pending.length === 0) return []

  const allocated = pending.reduce(
    (sum, p) => sum + (p.kind === "amount" ? p.amount : 0),
    0,
  )

  const out: ParsedMilestone[] = pending.map((p) =>
    p.kind === "amount"
      ? { label: p.label, amount: p.amount }
      : { label: p.label, amount: round2(Math.max(0, projectTotal - allocated)) },
  )

  // Fold rounding drift into the last milestone when the schedule was
  // clearly meant to cover the whole total (within a dollar).
  const sum = out.reduce((s, m) => s + m.amount, 0)
  const drift = round2(projectTotal - sum)
  if (drift !== 0 && Math.abs(drift) <= 1 && out.length > 0 && projectTotal > 0) {
    out[out.length - 1]!.amount = round2(out[out.length - 1]!.amount + drift)
  }

  return out
}
