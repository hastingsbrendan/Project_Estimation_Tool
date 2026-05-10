import { auth } from "@/auth"
import { findAlternatives } from "@/lib/ai/material-matcher"
import { logError, logInfo } from "@/lib/log"
import { parseFindAlternativeBody } from "@/lib/api-v1/parsers"

export const runtime = "nodejs"
export const maxDuration = 30

const SCOPE = "/api/v1/find-alternative"

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

  const parsed = parseFindAlternativeBody(body)
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

