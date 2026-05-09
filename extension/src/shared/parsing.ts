/**
 * Pure parsing helpers used by the Home Depot driver. Lifted out of
 * `content/home-depot-driver.ts` so they can be unit-tested without
 * mocking the chrome.* APIs or the DOM. The driver re-exports / wraps
 * them; behavior must stay byte-identical.
 */
import type { Material } from "./types"

const SEARCH_URL = (q: string) =>
  `https://www.homedepot.com/s/${encodeURIComponent(q)}`

/**
 * Pick a search URL for a material:
 *   - When the contractor saved an HD SKU, search by SKU. HD's search
 *     redirects exact SKU matches straight to the PDP — far more
 *     reliable than fuzzy description matching.
 *   - Otherwise fall back to the description text.
 */
export function searchUrlFor(material: Material): string {
  if (material.hdSku && material.hdSku.trim()) {
    return SEARCH_URL(material.hdSku.trim())
  }
  return SEARCH_URL(material.description)
}

/**
 * Parse a price string scraped off an HD product card / PDP. HD prints
 * prices like "$12.99", "12.99", "$1,234.56", or "From $9.99". We
 * grab the first dollar-amount-looking run.
 */
export function parsePrice(s: string): number | null {
  if (!s) return null
  const m = s.match(/\$?\s*(\d[\d,]*\.?\d*)/)
  if (!m) return null
  const n = Number(m[1]?.replace(/,/g, "") ?? "")
  return Number.isFinite(n) ? n : null
}

/**
 * Extract a "pack of N" / "N-pk" / "N ct" / "N lb" / etc fragment
 * from a product title. Used to disambiguate variants when the same
 * product comes in multiple pack sizes (drywall screws are notorious
 * for this).
 */
export function extractPack(title: string): string | null {
  const m = title.match(
    /\(?\s*(pack of \d+|\d+\s*[-]?\s*pack|\d+\s*pk\b|\d+\s*ct\b|\d+\s*lb\b|\d+\s*oz\b|\d+\s*gal\b)\s*\)?/i,
  )
  return m?.[1]?.trim() ?? null
}

/**
 * Test whether a URL is one of HD's product detail pages. The
 * permalink shape `/p/<slug>/<id>` (or `/p/<id>`) is HD's stable
 * contract — far more durable than the ever-rotating data-testid
 * attributes on the page body.
 */
export function isPdpUrl(pathname: string): boolean {
  return /\/p\/[^/]+\/\d+/.test(pathname)
}
