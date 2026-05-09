/**
 * Receipt parser backed by Claude vision. Returns structured line items
 * given a receipt photo. Failure modes (no API key, network error, model
 * returned non-JSON, schema mismatch) all degrade to a clear error message
 * the caller can show to the user — they fall back to manual entry.
 */
import Anthropic from "@anthropic-ai/sdk"

export type ParsedReceipt = {
  vendor: string | null
  purchasedAt: string | null // ISO date
  subtotal: number | null
  tax: number | null
  total: number | null
  items: Array<{
    description: string
    quantity: number
    unit: string | null
    unitPrice: number
    lineTotal: number | null
    sku: string | null
  }>
}

export type ParseResult =
  | { ok: true; data: ParsedReceipt; raw: string }
  | { ok: false; error: string; raw?: string }

const MODEL = "claude-sonnet-4-5-20250929"
const MAX_TOKENS = 2048

const SYSTEM_PROMPT = `You extract structured data from contractor / hardware-store receipts.
Return ONLY a single JSON object — no prose, no markdown fence — matching this exact shape:
{
  "vendor": string | null,
  "purchasedAt": string | null,   // ISO 8601 date if visible, e.g. "2026-05-07"
  "subtotal": number | null,
  "tax": number | null,
  "total": number | null,
  "items": [
    {
      "description": string,
      "quantity": number,           // 1 if not visible
      "unit": string | null,        // "ea", "lf", "sqft", "lb", etc. — null if unclear
      "unitPrice": number,
      "lineTotal": number | null,   // post-discount line total if printed; null otherwise
      "sku": string | null
    }
  ]
}
Rules:
- All money is USD positive numbers. Round to two decimals.
- Skip non-product lines: subtotals, tax lines, payment / tender, store hours, return policy, barcodes printed as text, customer copy footers.
- If a description is wrapped across multiple lines, join them with a space.
- If you can't read the receipt at all, return all nulls and an empty items array.
- DO NOT invent values not visible in the receipt.

SKU extraction — this matters; downstream code uses SKUs to navigate
straight to product pages on the retailer's website:
- Home Depot receipts: each line's SKU is a 6–12 digit number printed
  on the same row as the description, often labeled "SKU" or just
  bare. Sometimes printed as "<NNN> <NNN-NNN>" — return the digits
  joined together with no spaces or dashes.
- Lowe's receipts: SKUs are 7-digit "Item #" numbers.
- If the receipt printed a barcode-style number (12+ digits) under
  the description, that's a UPC, NOT an SKU — leave sku as null and
  do NOT confuse a UPC with the retailer's SKU.
- If the SKU is partially obscured, faded, or you're not confident,
  return null for that line's sku rather than guessing. A missing SKU
  is recoverable; a wrong SKU sends the user to the wrong product.`

export async function parseReceiptWithClaude(
  imageBuffer: Buffer,
  mediaType: string,
): Promise<ParseResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return { ok: false, error: "ANTHROPIC_API_KEY is not set" }

  const supportedImage = ["image/jpeg", "image/png", "image/webp", "image/gif"]
  const isPdf = mediaType === "application/pdf"
  // HEIC/HEIF aren't natively supported by Claude vision; tell the user to
  // convert. Most phones will let users export as JPEG instead.
  if (!isPdf && !supportedImage.includes(mediaType)) {
    return {
      ok: false,
      error: `Unsupported media type for AI parse: ${mediaType}. Convert to JPEG/PNG/PDF.`,
    }
  }

  const client = new Anthropic({ apiKey })

  // For PDFs, use a `document` content block (Claude's PDF support); for
  // images, use the standard `image` block.
  const sourceBlock = isPdf
    ? ({
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: imageBuffer.toString("base64"),
        },
      } as const)
    : ({
        type: "image",
        source: {
          type: "base64",
          media_type: mediaType as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
          data: imageBuffer.toString("base64"),
        },
      } as const)

  let response
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            sourceBlock,
            {
              type: "text",
              text: "Extract this receipt as the JSON object specified.",
            },
          ],
        },
      ],
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
  const raw = textBlock.text.trim()

  // The system prompt asks for raw JSON; strip code fences just in case.
  const jsonText = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim()
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    return {
      ok: false,
      error: "Claude returned non-JSON output. Try again or enter manually.",
      raw,
    }
  }

  // Defensive shape coercion — model output sometimes has extra fields or
  // missing nullable ones. We accept anything that has at least an items
  // array; everything else is best-effort.
  const data = coerce(parsed)
  if (!data) {
    return { ok: false, error: "Claude output didn't match the expected schema.", raw }
  }
  return { ok: true, data, raw }
}

function coerce(input: unknown): ParsedReceipt | null {
  if (!input || typeof input !== "object") return null
  const obj = input as Record<string, unknown>
  const itemsRaw = obj.items
  if (!Array.isArray(itemsRaw)) return null

  const items: ParsedReceipt["items"] = []
  for (const it of itemsRaw) {
    if (!it || typeof it !== "object") continue
    const item = it as Record<string, unknown>
    const description = typeof item.description === "string" ? item.description.trim() : ""
    if (!description) continue
    const quantity = num(item.quantity, 1)
    const unitPrice = num(item.unitPrice, 0)
    items.push({
      description,
      quantity,
      unit: strOrNull(item.unit),
      unitPrice,
      lineTotal: numOrNull(item.lineTotal),
      sku: strOrNull(item.sku),
    })
  }

  return {
    vendor: strOrNull(obj.vendor),
    purchasedAt: strOrNull(obj.purchasedAt),
    subtotal: numOrNull(obj.subtotal),
    tax: numOrNull(obj.tax),
    total: numOrNull(obj.total),
    items,
  }
}

function strOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null
  const s = v.trim()
  return s ? s : null
}
function num(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v)
  return Number.isFinite(n) ? n : fallback
}
function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null
  const n = typeof v === "number" ? v : Number(v)
  return Number.isFinite(n) ? n : null
}
