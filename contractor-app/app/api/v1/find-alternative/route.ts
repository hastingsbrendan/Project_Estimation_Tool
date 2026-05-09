import { auth } from "@/auth"
import {
  findAlternatives,
  type Candidate,
  type MaterialSpec,
} from "@/lib/ai/material-matcher"
import { logError, logInfo } from "@/lib/log"

export const runtime = "nodejs"
export const maxDuration = 30

const SCOPE = "/api/v1/find-alternative"
const MAX_ALTS = 12

/**
 * POST body:
 * {
 *   material: MaterialSpec,
 *   oosCandidate: Candidate,        // the one that's out of stock
 *   alternatives: Candidate[],      // other in-stock candidates to rank
 * }
 *
 * Returns: { ranked: [{idx, confidence, reasoning}, ...] }
 *
 * Per the plan (option C-β), the extension NEVER auto-substitutes — the
 * contractor sees these and clicks one explicitly.
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
  const { material, oosCandidate, alternatives } = parsed

  try {
    const result = await findAlternatives(material, oosCandidate, alternatives)
    logInfo(SCOPE, "Ranked alternatives", {
      userEmail: session.user.email,
      description: material.description,
      altCount: alternatives.length,
      rankedCount: result.ranked.length,
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

type ParseOk = {
  ok: true
  material: MaterialSpec
  oosCandidate: Candidate
  alternatives: Candidate[]
}
type ParseErr = { ok: false; error: string }

function readCandidate(raw: unknown): Candidate | null {
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

function parseRequest(body: unknown): ParseOk | ParseErr {
  if (!body || typeof body !== "object") return { ok: false, error: "Bad body" }
  const b = body as Record<string, unknown>
  const m = b.material
  if (!m || typeof m !== "object") return { ok: false, error: "Missing material" }
  const ms = m as Record<string, unknown>
  const description = typeof ms.description === "string" ? ms.description.trim() : ""
  const unit = typeof ms.unit === "string" ? ms.unit.trim() : ""
  if (!description || !unit) {
    return { ok: false, error: "material.description and unit required" }
  }
  const quantity =
    typeof ms.quantity === "number" ? ms.quantity : Number(ms.quantity ?? 1)

  const oosCandidate = readCandidate(b.oosCandidate)
  if (!oosCandidate) return { ok: false, error: "oosCandidate required" }

  const altsArr = Array.isArray(b.alternatives) ? b.alternatives : null
  if (!altsArr) return { ok: false, error: "alternatives must be an array" }

  const alternatives: Candidate[] = altsArr
    .slice(0, MAX_ALTS)
    .map(readCandidate)
    .filter((c): c is Candidate => c != null)

  return {
    ok: true,
    material: {
      description,
      unit,
      quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
      notes: typeof ms.notes === "string" ? ms.notes : null,
    },
    oosCandidate,
    alternatives,
  }
}
