/**
 * Claude-backed matcher for the cart-builder extension. Given a catalog
 * material (description + unit + maybe a brand hint) and a small list of
 * candidates the extension scraped from a HD search results page, decide:
 *
 *  - Which candidate is the best match
 *  - How confident we are (0–1)
 *  - One sentence explaining why, for the side panel
 *
 * Inference runs server-side so the API key never ships in the extension
 * bundle. Prompt is JSON-shaped, low temperature, capped tokens — there's
 * no creative writing to do here, just structured decision making.
 */
import Anthropic from "@anthropic-ai/sdk"

const MODEL = "claude-sonnet-4-5-20250929"
const MAX_TOKENS = 512

export type MaterialSpec = {
  description: string
  unit: string
  quantity: number
  notes?: string | null
}

export type Candidate = {
  title: string
  sku: string
  url: string
  price: number | null
  inStock: boolean
  brand: string | null
  pack: string | null
}

export type MatchResult = {
  bestIdx: number | null
  confidence: number
  reasoning: string
}

export type AlternativeRanking = {
  ranked: Array<{ idx: number; confidence: number; reasoning: string }>
}

const MATCH_SYSTEM_PROMPT = `You match a contractor's catalog material to the most plausible Home Depot product from a small list of search results. Return ONLY a single JSON object — no prose, no markdown fence — matching this exact shape:

{
  "bestIdx": number | null,   // 0-based index into candidates, or null if NONE plausibly match
  "confidence": number,        // 0..1 — how sure are you this is what the contractor meant?
  "reasoning": string          // one sentence, ≤ 140 chars, suitable for a side-panel UI
}

Rules:
- Match on description semantics + dimensions + unit. A "2x4 stud, 8ft, SPF" matches an HD product titled "2-in x 4-in x 8-ft Premium SPF Stud" with high confidence.
- Penalize wrong unit: if the catalog asks for "sheet" and the candidate is sold "per ft", confidence drops sharply.
- Penalize pack mismatches: 1 unit catalog vs 50-pack HD candidate is suspicious unless the contractor needs that quantity.
- Out-of-stock candidates are still valid matches — the caller will branch on inStock separately. Don't downrank for stock.
- Brand: prefer matches when the catalog notes a brand. Don't invent a brand mismatch when the catalog doesn't specify.
- If no candidate plausibly matches (e.g. all results are unrelated products), return bestIdx=null and confidence=0.
- DO NOT return a SKU or URL. Just the index.`

const ALT_SYSTEM_PROMPT = `You rank potential SUBSTITUTES for a contractor's catalog material when the original best match is out of stock. Return ONLY a JSON object:

{
  "ranked": [
    { "idx": number, "confidence": number, "reasoning": string }
  ]
}

Rules:
- Up to 3 entries, ordered best-first. Empty array if nothing's a reasonable substitute.
- Substitute = same job, different brand or pack size or minor spec drift. NOT a different category.
- Cite what's similar AND what's different in reasoning ("Same brand, larger pack of 50 vs 25").
- Confidence ≤ 0.85 — substitutes are inherently lossier than direct matches.
- DO NOT include items that mismatch the unit or core dimensions.`

function buildMatchPrompt(material: MaterialSpec, candidates: Candidate[]): string {
  const candidateLines = candidates
    .map((c, i) => {
      const parts = [
        `[${i}] ${c.title}`,
        c.brand ? `brand: ${c.brand}` : null,
        c.pack ? `pack: ${c.pack}` : null,
        c.price != null ? `price: $${c.price.toFixed(2)}` : null,
        `inStock: ${c.inStock}`,
      ].filter(Boolean)
      return parts.join(" · ")
    })
    .join("\n")

  return `Catalog material:
- description: ${material.description}
- unit: ${material.unit}
- quantity: ${material.quantity}${material.notes ? `\n- notes: ${material.notes}` : ""}

Home Depot search candidates:
${candidateLines}

Pick the best match (or null) and return the JSON.`
}

function parseJsonObjectFromText(raw: string): unknown {
  // Strip optional code fences just in case.
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim()
  return JSON.parse(cleaned)
}

function clampConfidence(n: unknown): number {
  const v = typeof n === "number" ? n : Number(n)
  if (!Number.isFinite(v)) return 0
  return Math.max(0, Math.min(1, v))
}

function shortString(s: unknown, max = 200): string {
  if (typeof s !== "string") return ""
  const trimmed = s.trim()
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed
}

/**
 * Match a single material against an array of candidates. Returns a
 * deterministic fallback (`bestIdx: null, confidence: 0`) on any model
 * error — the caller decides UI consequences.
 */
export async function matchMaterial(
  material: MaterialSpec,
  candidates: Candidate[],
): Promise<MatchResult> {
  if (candidates.length === 0) {
    return { bestIdx: null, confidence: 0, reasoning: "No candidates provided." }
  }
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return {
      bestIdx: null,
      confidence: 0,
      reasoning: "ANTHROPIC_API_KEY not configured.",
    }
  }

  const client = new Anthropic({ apiKey })
  let response
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      temperature: 0.1,
      system: MATCH_SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildMatchPrompt(material, candidates) }],
    })
  } catch (e) {
    return {
      bestIdx: null,
      confidence: 0,
      reasoning:
        e instanceof Error ? `Claude request failed: ${e.message}` : "Claude failed",
    }
  }

  const text = response.content.find((c) => c.type === "text")
  if (!text || text.type !== "text") {
    return { bestIdx: null, confidence: 0, reasoning: "Claude returned no text" }
  }

  let parsed: unknown
  try {
    parsed = parseJsonObjectFromText(text.text)
  } catch {
    return { bestIdx: null, confidence: 0, reasoning: "Claude returned non-JSON" }
  }
  if (!parsed || typeof parsed !== "object") {
    return { bestIdx: null, confidence: 0, reasoning: "Bad JSON shape" }
  }
  const obj = parsed as Record<string, unknown>
  const rawIdx = obj.bestIdx
  let bestIdx: number | null = null
  if (typeof rawIdx === "number" && Number.isInteger(rawIdx) && rawIdx >= 0 && rawIdx < candidates.length) {
    bestIdx = rawIdx
  }
  return {
    bestIdx,
    confidence: clampConfidence(obj.confidence),
    reasoning: shortString(obj.reasoning, 200) || "(no reasoning)",
  }
}

/**
 * Same flow, framed as "find a substitute" rather than "find a match."
 */
export async function findAlternatives(
  material: MaterialSpec,
  oosCandidate: Candidate,
  alternatives: Candidate[],
): Promise<AlternativeRanking> {
  if (alternatives.length === 0) return { ranked: [] }
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return { ranked: [] }

  const client = new Anthropic({ apiKey })
  const userPrompt = `Catalog material:
- description: ${material.description}
- unit: ${material.unit}
- quantity: ${material.quantity}${material.notes ? `\n- notes: ${material.notes}` : ""}

Original (out of stock): ${oosCandidate.title}${oosCandidate.brand ? ` (${oosCandidate.brand})` : ""}

Available alternatives:
${alternatives
  .map((c, i) => {
    const parts = [
      `[${i}] ${c.title}`,
      c.brand ? `brand: ${c.brand}` : null,
      c.pack ? `pack: ${c.pack}` : null,
      c.price != null ? `price: $${c.price.toFixed(2)}` : null,
    ].filter(Boolean)
    return parts.join(" · ")
  })
  .join("\n")}

Rank the substitutes (best first, up to 3) and return the JSON.`

  let response
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      temperature: 0.1,
      system: ALT_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    })
  } catch {
    return { ranked: [] }
  }
  const text = response.content.find((c) => c.type === "text")
  if (!text || text.type !== "text") return { ranked: [] }
  let parsed: unknown
  try {
    parsed = parseJsonObjectFromText(text.text)
  } catch {
    return { ranked: [] }
  }
  if (!parsed || typeof parsed !== "object") return { ranked: [] }
  const obj = parsed as Record<string, unknown>
  const arr = Array.isArray(obj.ranked) ? obj.ranked : []
  const ranked = arr
    .slice(0, 3)
    .map((r) => {
      if (!r || typeof r !== "object") return null
      const o = r as Record<string, unknown>
      const idx = typeof o.idx === "number" ? o.idx : Number(o.idx)
      if (!Number.isInteger(idx) || idx < 0 || idx >= alternatives.length) return null
      return {
        idx,
        confidence: clampConfidence(o.confidence),
        reasoning: shortString(o.reasoning, 200) || "(no reasoning)",
      }
    })
    .filter((r): r is { idx: number; confidence: number; reasoning: string } => r != null)
  return { ranked }
}

/**
 * Internal helper exported for unit tests so we can verify the prompt
 * shape without making a live Claude call.
 */
export const __test = { buildMatchPrompt, parseJsonObjectFromText }
