/**
 * Body parsers for the /api/v1/match-material and /api/v1/find-alternative
 * route handlers. Extracted from the routes themselves so we can unit-test
 * the validation contract without spinning up Next's request lifecycle.
 *
 * The route handlers are external API surface — anyone (including a
 * future CLI / mobile client) can hit these. Strict validation here is
 * the contract; lax validation lets callers send junk that breaks the
 * Claude prompt downstream.
 */

import type { Candidate, MaterialSpec } from "@/lib/ai/material-matcher"

export const MAX_CANDIDATES = 12
export const MAX_ALTS = 12

export type ParseOk<T> = { ok: true } & T
export type ParseErr = { ok: false; error: string }

/**
 * Coerce one candidate object from the request body. Returns null
 * (skip) for any unparseable / title-less entry — the caller filters
 * the array, so a few junk entries don't fail the whole request.
 */
export function readCandidate(raw: unknown): Candidate | null {
  if (!raw || typeof raw !== "object") return null
  const c = raw as Record<string, unknown>
  const title = typeof c.title === "string" ? c.title.trim() : ""
  if (!title) return null
  return {
    title,
    sku: typeof c.sku === "string" ? c.sku : "",
    url: typeof c.url === "string" ? c.url : "",
    price: typeof c.price === "number" ? c.price : null,
    inStock: c.inStock === true,
    brand: typeof c.brand === "string" ? c.brand : null,
    pack: typeof c.pack === "string" ? c.pack : null,
  }
}

function readMaterialSpec(raw: unknown): MaterialSpec | { error: string } {
  if (!raw || typeof raw !== "object") return { error: "Missing material" }
  const ms = raw as Record<string, unknown>
  const description = typeof ms.description === "string" ? ms.description.trim() : ""
  const unit = typeof ms.unit === "string" ? ms.unit.trim() : ""
  if (!description) return { error: "material.description required" }
  if (!unit) return { error: "material.unit required" }
  const quantityRaw = ms.quantity
  const quantity =
    typeof quantityRaw === "number" ? quantityRaw : Number(quantityRaw ?? 1)
  return {
    description,
    unit,
    quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
    notes: typeof ms.notes === "string" ? ms.notes : null,
  }
}

/**
 * Validate the body of POST /api/v1/match-material.
 *
 * Required: material.description, material.unit, candidates (non-empty).
 * Caps candidates at MAX_CANDIDATES (defense-in-depth — the Claude
 * prompt cost grows linearly).
 */
export function parseMatchMaterialBody(
  body: unknown,
): ParseOk<{ material: MaterialSpec; candidates: Candidate[] }> | ParseErr {
  if (!body || typeof body !== "object") return { ok: false, error: "Bad body" }
  const b = body as Record<string, unknown>

  const m = readMaterialSpec(b.material)
  if ("error" in m) return { ok: false, error: m.error }

  const candArr = Array.isArray(b.candidates) ? b.candidates : null
  if (!candArr) return { ok: false, error: "candidates must be an array" }
  if (candArr.length === 0) {
    return { ok: false, error: "candidates must be non-empty" }
  }

  const candidates: Candidate[] = candArr
    .slice(0, MAX_CANDIDATES)
    .map(readCandidate)
    .filter((c): c is Candidate => c != null)

  if (candidates.length === 0) return { ok: false, error: "No valid candidates" }

  return { ok: true, material: m, candidates }
}

/**
 * Validate the body of POST /api/v1/find-alternative.
 *
 * Required: material, oosCandidate (the OOS product we're substituting),
 * alternatives (array of in-stock candidates to rank).
 *
 * Per the plan (option C-β) the extension never auto-substitutes —
 * the user picks from the ranked list. So an empty alternatives array
 * is technically valid (we'd return ranked: []) but we still require
 * the array to be present so callers can't omit it accidentally.
 */
export function parseFindAlternativeBody(
  body: unknown,
):
  | ParseOk<{
      material: MaterialSpec
      oosCandidate: Candidate
      alternatives: Candidate[]
    }>
  | ParseErr {
  if (!body || typeof body !== "object") return { ok: false, error: "Bad body" }
  const b = body as Record<string, unknown>

  const m = readMaterialSpec(b.material)
  if ("error" in m) return { ok: false, error: m.error }

  const oosCandidate = readCandidate(b.oosCandidate)
  if (!oosCandidate) return { ok: false, error: "oosCandidate required" }

  const altsArr = Array.isArray(b.alternatives) ? b.alternatives : null
  if (!altsArr) return { ok: false, error: "alternatives must be an array" }

  const alternatives: Candidate[] = altsArr
    .slice(0, MAX_ALTS)
    .map(readCandidate)
    .filter((c): c is Candidate => c != null)

  return { ok: true, material: m, oosCandidate, alternatives }
}
