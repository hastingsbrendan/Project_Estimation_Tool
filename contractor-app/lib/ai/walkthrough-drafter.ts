/**
 * Claude-backed estimate drafter — the "walk the jobsite, talk, get a
 * draft" capstone from the original product vision. Given a transcript
 * of the contractor's spoken (or typed) walkthrough notes plus their
 * catalog, produce draft sections + line items the contractor reviews
 * before anything is written.
 *
 * Same conventions as material-matcher: server-side inference, JSON
 * shape forced by the system prompt, low creative temperature, and a
 * pure coercion layer (`coerceDraft`) exported for unit tests.
 */
import Anthropic from "@anthropic-ai/sdk"

const MODEL = "claude-sonnet-4-5-20250929"
const MAX_TOKENS = 4096

export type CatalogRowForDraft = {
  id: string
  description: string
  unit: string
  unitPrice: number
  kind: string // "material" | "labor"
}

export type DraftItem = {
  description: string
  quantity: number
  unit: string
  unitPrice: number
  kind: "material" | "labor"
  /** Set when the item maps to one of the user's catalog rows. */
  catalogItemId: string | null
}

export type DraftSection = {
  name: string
  items: DraftItem[]
}

export type DraftResult =
  | { ok: true; sections: DraftSection[]; notes: string | null }
  | { ok: false; error: string }

const SYSTEM_PROMPT = `You turn a remodeling contractor's spoken walkthrough notes into a draft estimate. You receive the transcript and the contractor's price catalog (their real services + materials with their prices). Return ONLY a single JSON object — no prose, no markdown fence:

{
  "sections": [
    {
      "name": string,              // e.g. "Kitchen", "Demo", "Bathroom — hall"
      "items": [
        {
          "description": string,
          "quantity": number,
          "unit": string,          // "ea", "sqft", "lf", "hr", "sheet", ...
          "unitPrice": number,
          "kind": "material" | "labor",
          "catalogItemId": string | null   // the catalog row's id when you used one
        }
      ]
    }
  ],
  "notes": string | null           // anything ambiguous the contractor should double-check, ≤ 300 chars
}

Rules:
- STRONGLY prefer catalog rows: when the transcript implies work the catalog covers, use that row's id, description, unit, unitPrice, and kind verbatim. Only invent a custom item when nothing in the catalog fits; custom items get your best description, the most natural unit, kind, and unitPrice 0 (the contractor prices it).
- Quantities must come from the transcript (stated or arithmetically implied — "twelve by ten kitchen floor" → 120 sqft). When a quantity is genuinely unknowable, use 1 and mention it in notes.
- Organize sections the way the contractor speaks: by room when they walk room to room, by trade when they talk trades.
- Include BOTH the labor and the obvious companion materials when the contractor names a job ("tear out and re-drywall this wall" → demo labor + hang/tape labor + drywall sheets + screws + mud) — but only with catalog rows or clearly implied items; don't pad.
- Never invent scope the transcript doesn't mention.
- If the transcript contains no actionable scope at all, return {"sections": [], "notes": "..."} explaining why.`

function buildPrompt(transcript: string, catalog: CatalogRowForDraft[]): string {
  const catalogLines = catalog
    .map(
      (c) =>
        `${c.id} | ${c.kind} | ${c.description} | ${c.unit} | $${c.unitPrice.toFixed(2)}`,
    )
    .join("\n")
  return `CATALOG (id | kind | description | unit | unit price):
${catalogLines || "(empty catalog)"}

WALKTHROUGH TRANSCRIPT:
"""
${transcript.trim()}
"""

Draft the estimate JSON now.`
}

function parseJsonObjectFromText(raw: string): unknown | null {
  const text = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim()
  try {
    return JSON.parse(text)
  } catch {
    // Model sometimes prefixes a sentence despite instructions — try to
    // recover the outermost object.
    const start = text.indexOf("{")
    const end = text.lastIndexOf("}")
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1))
      } catch {
        return null
      }
    }
    return null
  }
}

/**
 * Pure coercion of model output → DraftSection[]. Drops malformed
 * items rather than failing the whole draft; clears catalogItemIds
 * that aren't in the user's catalog (the model occasionally
 * hallucinates ids — a cleared id just means "custom item").
 */
export function coerceDraft(
  input: unknown,
  validCatalogIds: Set<string>,
): { sections: DraftSection[]; notes: string | null } | null {
  if (!input || typeof input !== "object") return null
  const obj = input as Record<string, unknown>
  if (!Array.isArray(obj.sections)) return null

  const sections: DraftSection[] = []
  for (const rawSection of obj.sections) {
    if (!rawSection || typeof rawSection !== "object") continue
    const s = rawSection as Record<string, unknown>
    const name = typeof s.name === "string" ? s.name.trim() : ""
    if (!name || !Array.isArray(s.items)) continue

    const items: DraftItem[] = []
    for (const rawItem of s.items) {
      if (!rawItem || typeof rawItem !== "object") continue
      const it = rawItem as Record<string, unknown>
      const description =
        typeof it.description === "string" ? it.description.trim() : ""
      if (!description) continue
      const quantity = Number(it.quantity)
      const unitPrice = Number(it.unitPrice)
      const rawId = typeof it.catalogItemId === "string" ? it.catalogItemId : null
      items.push({
        description,
        quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
        unit: typeof it.unit === "string" && it.unit.trim() ? it.unit.trim() : "ea",
        unitPrice: Number.isFinite(unitPrice) && unitPrice >= 0 ? unitPrice : 0,
        kind: it.kind === "labor" ? "labor" : "material",
        catalogItemId: rawId && validCatalogIds.has(rawId) ? rawId : null,
      })
    }
    if (items.length > 0) sections.push({ name, items })
  }

  return {
    sections,
    notes:
      typeof obj.notes === "string" && obj.notes.trim() ? obj.notes.trim() : null,
  }
}

export async function draftEstimateFromTranscript(
  transcript: string,
  catalog: CatalogRowForDraft[],
): Promise<DraftResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return {
      ok: false,
      error:
        "AI drafting isn't configured (ANTHROPIC_API_KEY missing). Add items manually for now.",
    }
  }
  if (!transcript.trim()) {
    return { ok: false, error: "Transcript is empty." }
  }

  const client = new Anthropic({ apiKey })
  let response
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildPrompt(transcript, catalog) }],
    })
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? `Claude request failed: ${e.message}` : "Claude request failed",
    }
  }

  const textBlock = response.content.find((c) => c.type === "text")
  if (!textBlock || textBlock.type !== "text") {
    return { ok: false, error: "Claude returned no text" }
  }
  const parsed = parseJsonObjectFromText(textBlock.text)
  const draft = coerceDraft(parsed, new Set(catalog.map((c) => c.id)))
  if (!draft) {
    return { ok: false, error: "Claude output didn't match the expected shape. Try again." }
  }
  return { ok: true, ...draft }
}

/** Internal helpers exported for unit tests. */
export const __test = { buildPrompt, parseJsonObjectFromText }
