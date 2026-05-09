/**
 * Fuzzy match a receipt-parsed line item against a user's existing catalog
 * to figure out:
 *   - is it the SAME thing they already have? → likely match (≥ 0.8)
 *   - is it kinda the same thing? → uncertain (0.5–0.8)
 *   - is it new? → no match (< 0.5)
 *
 * No Claude calls. Pure string algorithms — fast, deterministic, runs
 * server-side inside the action so the receipt detail page renders the
 * review screen without an extra round-trip.
 *
 * Score = trigram-Jaccard(description) × 0.7 + exact-unit-match × 0.3.
 * Trigrams over a normalized description capture the "2x4 stud, 8ft, SPF"
 * vs "2x4-8 stud SPF" case naturally; exact unit match guards against
 * matching "Tile 12x12" to "Tile" with mismatched units.
 */

export type FuzzyCandidate = {
  id: string
  description: string
  unit: string
}

export type FuzzyScore = {
  candidateId: string
  score: number // 0–1
  descriptionScore: number
  unitMatch: boolean
}

const DESC_WEIGHT = 0.7
const UNIT_WEIGHT = 0.3

/**
 * Normalize a description: lowercase, strip punctuation, collapse whitespace.
 * Keeps digits + letters; trims away parens, slashes, dashes, etc, that
 * vary between hand-typed catalog entries and machine-parsed receipts.
 */
export function normalizeDescription(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function trigrams(s: string): Set<string> {
  const padded = `  ${s}  `
  const out = new Set<string>()
  for (let i = 0; i <= padded.length - 3; i++) {
    out.add(padded.slice(i, i + 3))
  }
  return out
}

/**
 * Jaccard similarity over trigrams. Returns 0 if either side is empty;
 * 1 for identical sets.
 */
export function trigramJaccard(a: string, b: string): number {
  const an = normalizeDescription(a)
  const bn = normalizeDescription(b)
  if (!an || !bn) return 0
  if (an === bn) return 1
  const at = trigrams(an)
  const bt = trigrams(bn)
  if (at.size === 0 || bt.size === 0) return 0
  let intersection = 0
  for (const t of at) if (bt.has(t)) intersection++
  const union = at.size + bt.size - intersection
  return union === 0 ? 0 : intersection / union
}

function unitMatches(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

/**
 * Score a single (description, unit) pair against every candidate. Returns
 * scores sorted descending — caller picks top by threshold.
 */
export function scoreAgainstCatalog(
  query: { description: string; unit: string },
  catalog: FuzzyCandidate[],
): FuzzyScore[] {
  return catalog
    .map((c) => {
      const descriptionScore = trigramJaccard(query.description, c.description)
      const unitMatch = unitMatches(query.unit, c.unit)
      const score =
        descriptionScore * DESC_WEIGHT + (unitMatch ? UNIT_WEIGHT : 0)
      return { candidateId: c.id, score, descriptionScore, unitMatch }
    })
    .sort((a, b) => b.score - a.score)
}

/**
 * Threshold-based bucketing. The action layer consumes this to build the
 * three review tables (matches / uncertain / newItems).
 *
 * - `LIKELY_MATCH` ≥ 0.8 → confident enough to default to "update price"
 *   in the UI (still off-by-default per the plan, but obvious to tick).
 * - `UNCERTAIN` 0.5 – 0.8 → render top candidate + dropdown to override.
 * - `NEW` < 0.5 → no match; row goes in the "new items" section.
 */
export const THRESHOLDS = {
  likely: 0.8,
  uncertain: 0.5,
} as const

export type Bucket = "likely" | "uncertain" | "new"

export function bucketize(score: number): Bucket {
  if (score >= THRESHOLDS.likely) return "likely"
  if (score >= THRESHOLDS.uncertain) return "uncertain"
  return "new"
}
