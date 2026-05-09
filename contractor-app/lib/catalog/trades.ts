/**
 * Canonical trade taxonomy for the catalog.
 *
 * Single source of truth — all server validation and client UI imports
 * from here. Aligns with the SubcontractorSpecialty seed (seeds/specialties.ts)
 * so a sub's specialty maps cleanly to the catalog trade they work on.
 *
 * Adding a new trade: add a row, run typecheck, ship. Existing items keep
 * their trade string regardless. Removing a trade is breaking — leave
 * unused entries in place rather than deleting.
 */

export const TRADES = [
  { value: "demo", label: "Demo" },
  { value: "framing", label: "Framing" },
  { value: "plumbing", label: "Plumbing" },
  { value: "electrical", label: "Electrical" },
  { value: "drywall", label: "Drywall" },
  { value: "finish", label: "Finish carpentry" },
  { value: "painting", label: "Painting" },
  { value: "tile", label: "Tile" },
  { value: "flooring", label: "Flooring" },
  { value: "hvac", label: "HVAC" },
  { value: "roofing", label: "Roofing" },
  { value: "concrete", label: "Concrete" },
  { value: "landscape", label: "Landscape" },
] as const

export type TradeSlug = (typeof TRADES)[number]["value"]

export const TRADE_SLUGS: readonly string[] = TRADES.map((t) => t.value)

/**
 * Coerce an unvalidated string to a known trade slug. Falls back to
 * "finish" for anything we don't recognize so old data with a stale
 * trade string still renders. (We never throw — that would 500 a page
 * over a typo on an old row.)
 */
export function parseTradeSlug(v: string | null | undefined): TradeSlug {
  const s = String(v ?? "").trim().toLowerCase()
  return (TRADE_SLUGS as readonly string[]).includes(s)
    ? (s as TradeSlug)
    : "finish"
}

/**
 * Human label for a trade slug, falling back to title-cased slug if we
 * don't have an entry (defensive for old data).
 */
export function tradeLabel(slug: string): string {
  const known = TRADES.find((t) => t.value === slug)
  if (known) return known.label
  return slug.charAt(0).toUpperCase() + slug.slice(1)
}
