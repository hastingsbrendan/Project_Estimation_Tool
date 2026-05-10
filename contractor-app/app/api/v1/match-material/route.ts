import { auth } from "@/auth"
import { matchMaterial } from "@/lib/ai/material-matcher"
import { logError, logInfo } from "@/lib/log"
import { parseMatchMaterialBody } from "@/lib/api-v1/parsers"

export const runtime = "nodejs"
export const maxDuration = 30 // Claude calls land < 5s typical, 25s p99

const SCOPE = "/api/v1/match-material"

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

  const parsed = parseMatchMaterialBody(body)
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

