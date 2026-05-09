import { auth } from "@/auth"
import { matchMaterial, type Candidate, type MaterialSpec } from "@/lib/ai/material-matcher"
import { logError, logInfo } from "@/lib/log"

export const runtime = "nodejs"
export const maxDuration = 30 // Claude calls land < 5s typical, 25s p99

const SCOPE = "/api/v1/match-material"
const MAX_CANDIDATES = 12

/**
 * POST body shape:
 * {
 *   material: { description, unit, quantity, notes? },
 *   candidates: Array<{ title, sku, url, price, inStock, brand, pack }>,
 * }
 *
 * Auth via session cookie. The extension's bridge content script issues
 * the fetch from a contractor-app page so cookies travel automatically.
 *
 * Returns: { bestIdx, confidence, reasoning } — see lib/ai/material-matcher.
 */
export async function POST(req: Request) {
  const started = Date.now()
  const session = await auth()
  if (!session?.user?.email) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const parsed = parseRequest(body)
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: 400 })
  }
  const { material, candidates } = parsed

  try {
    const result = await matchMaterial(material, candidates)
    logInfo(SCOPE, "Matched material", {
      userEmail: session.user.email,
      description: material.description,
      candidateCount: candidates.length,
      bestIdx: result.bestIdx,
      confidence: result.confidence,
      durationMs: Date.now() - started,
    })
    return Response.json(result)
  } catch (e) {
    logError(SCOPE, e, {
      userEmail: session.user.email,
      durationMs: Date.now() - started,
    })
    return Response.json({ error: "Internal error" }, { status: 500 })
  }
}

type ParseOk = { ok: true; material: MaterialSpec; candidates: Candidate[] }
type ParseErr = { ok: false; error: string }

function parseRequest(body: unknown): ParseOk | ParseErr {
  if (!body || typeof body !== "object") return { ok: false, error: "Bad body" }
  const b = body as Record<string, unknown>
  const m = b.material
  if (!m || typeof m !== "object") return { ok: false, error: "Missing material" }
  const ms = m as Record<string, unknown>
  const description = typeof ms.description === "string" ? ms.description.trim() : ""
  const unit = typeof ms.unit === "string" ? ms.unit.trim() : ""
  const quantityRaw = ms.quantity
  const quantity =
    typeof quantityRaw === "number" ? quantityRaw : Number(quantityRaw ?? 1)
  if (!description) return { ok: false, error: "material.description required" }
  if (!unit) return { ok: false, error: "material.unit required" }

  const candArr = Array.isArray(b.candidates) ? b.candidates : null
  if (!candArr) return { ok: false, error: "candidates must be an array" }
  if (candArr.length === 0) {
    return { ok: false, error: "candidates must be non-empty" }
  }

  const candidates: Candidate[] = []
  for (const raw of candArr.slice(0, MAX_CANDIDATES)) {
    if (!raw || typeof raw !== "object") continue
    const c = raw as Record<string, unknown>
    const title = typeof c.title === "string" ? c.title.trim() : ""
    if (!title) continue
    candidates.push({
      title,
      sku: typeof c.sku === "string" ? c.sku : "",
      url: typeof c.url === "string" ? c.url : "",
      price: typeof c.price === "number" ? c.price : null,
      inStock: c.inStock === true,
      brand: typeof c.brand === "string" ? c.brand : null,
      pack: typeof c.pack === "string" ? c.pack : null,
    })
  }
  if (candidates.length === 0) return { ok: false, error: "No valid candidates" }

  return {
    ok: true,
    material: {
      description,
      unit,
      quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
      notes: typeof ms.notes === "string" ? ms.notes : null,
    },
    candidates,
  }
}
