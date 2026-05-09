"use server"

import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { put, del } from "@vercel/blob"
import { parseReceiptWithClaude } from "@/lib/ai/receipt-parser"
import { requireReceipt, requireUserId } from "@/lib/auth-helpers"
import { logError, logInfo } from "@/lib/log"

const MAX_BYTES = 20 * 1024 * 1024 // 20 MB. Client compresses big images first.
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
])

function parseFloatSafe(v: FormDataEntryValue | null, fallback = 0): number {
  const n = Number(v ?? fallback)
  return Number.isFinite(n) ? n : fallback
}

/**
 * Upload a receipt image / PDF, store in Vercel Blob, create a DB row in
 * "pending" status, and return the new receipt id immediately. We do NOT
 * call Claude here — the parse can take 5–25s and would blow Vercel's
 * 10s function timeout. Parse runs as a separate action triggered by the
 * detail page on first load.
 */
export async function uploadReceipt(
  formData: FormData,
): Promise<{ ok: boolean; error?: string; receiptId?: string }> {
  const started = Date.now()
  try {
    const userId = await requireUserId()

    const file = formData.get("file")
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, error: "No file selected" }
    }
    if (file.size > MAX_BYTES) {
      return { ok: false, error: "File is larger than 20 MB" }
    }
    if (file.type && !ALLOWED_TYPES.has(file.type)) {
      return { ok: false, error: `Unsupported file type: ${file.type}` }
    }
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return {
        ok: false,
        error:
          "Receipt storage isn't enabled yet. In Vercel → Storage, connect a Blob store to this project.",
      }
    }

    // forCatalog routes the parsed items to the CatalogUpdateReview flow
    // instead of attaching to a project. Mutually exclusive with project
    // assignment — if both are sent, forCatalog wins (we ignore projectId).
    const forCatalog = String(formData.get("forCatalog") ?? "") === "1"
    const projectId = forCatalog
      ? null
      : String(formData.get("projectId") ?? "").trim() || null
    if (projectId) {
      const project = await prisma.project.findFirst({
        where: { id: projectId, userId },
      })
      if (!project) return { ok: false, error: "Project not found" }
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_") || "receipt"
    const pathname = `receipts/${userId}/${Date.now()}-${safeName}`
    let blob
    try {
      blob = await put(pathname, file, { access: "public", addRandomSuffix: false })
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Upload failed" }
    }

    const receipt = await prisma.receipt.create({
      data: {
        userId,
        projectId,
        imageUrl: blob.url,
        imagePathname: blob.pathname,
        filename: file.name,
        size: file.size,
        parseStatus: "pending",
        forCatalog,
      },
    })

    revalidatePath("/receipts")
    if (projectId) revalidatePath(`/projects/${projectId}`)
    logInfo("uploadReceipt", "Uploaded receipt", {
      userId,
      receiptId: receipt.id,
      projectId,
      forCatalog,
      filename: receipt.filename,
      sizeBytes: receipt.size,
      durationMs: Date.now() - started,
    })
    return { ok: true, receiptId: receipt.id }
  } catch (e) {
    // Always return an error object — never let the action throw, otherwise
    // Next.js renders a generic error page instead of our friendly modal.
    logError("uploadReceipt", e, { durationMs: Date.now() - started })
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Upload failed",
    }
  }
}

async function runParse(receiptId: string, imageBuffer: Buffer, mediaType: string): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    await prisma.receipt.update({
      where: { id: receiptId },
      data: {
        parseStatus: "manual",
        parseError:
          "AI parsing isn't configured. Set ANTHROPIC_API_KEY in Vercel env vars or enter line items manually.",
      },
    })
    return
  }

  const parsed = await parseReceiptWithClaude(imageBuffer, mediaType)
  if (!parsed.ok) {
    await prisma.receipt.update({
      where: { id: receiptId },
      data: {
        parseStatus: "error",
        parseError: parsed.error,
        parseRawJson: parsed.raw ?? null,
      },
    })
    return
  }

  // Atomic write: replace existing line items + update header fields. We
  // can't put a `createMany` *and* an `update` in a single transaction array
  // alongside a `deleteMany` cleanly (Prisma's typed transaction array
  // requires homogeneous shapes for createMany), so use the interactive
  // transaction form which is clearer anyway.
  const itemRows = parsed.data.items.map((it, i) => ({
    receiptId,
    description: it.description,
    quantity: it.quantity,
    unit: it.unit ?? "ea",
    unitPrice: it.unitPrice,
    lineTotal: it.lineTotal ?? null,
    sku: it.sku ?? null,
    order: i,
  }))
  await prisma.$transaction(async (tx) => {
    await tx.receiptItem.deleteMany({ where: { receiptId } })
    await tx.receipt.update({
      where: { id: receiptId },
      data: {
        vendor: parsed.data.vendor ?? null,
        purchasedAt: parsed.data.purchasedAt ? new Date(parsed.data.purchasedAt) : null,
        subtotal: parsed.data.subtotal ?? null,
        tax: parsed.data.tax ?? null,
        total: parsed.data.total ?? null,
        parseStatus: "parsed",
        parseError: null,
        parseRawJson: parsed.raw ?? null,
      },
    })
    if (itemRows.length > 0) {
      await tx.receiptItem.createMany({ data: itemRows })
    }
  })
}

/** Re-run Claude vision parse on an existing receipt (e.g. after env-var added). */
export async function reparseReceipt(
  receiptId: string,
): Promise<{ ok: boolean; error?: string }> {
  const started = Date.now()
  const { receipt } = await requireReceipt(receiptId)
  try {
    const res = await fetch(receipt.imageUrl)
    if (!res.ok) {
      logError("reparseReceipt", new Error(`Image fetch ${res.status}`), {
        receiptId,
        imageUrl: receipt.imageUrl,
      })
      return { ok: false, error: `Could not fetch image (${res.status})` }
    }
    const buffer = Buffer.from(await res.arrayBuffer())
    const mediaType = res.headers.get("content-type") ?? "image/jpeg"
    await runParse(receiptId, buffer, mediaType)
    revalidatePath(`/receipts/${receiptId}`)
    logInfo("reparseReceipt", "Re-parsed receipt", {
      receiptId,
      mediaType,
      durationMs: Date.now() - started,
    })
    return { ok: true }
  } catch (e) {
    logError("reparseReceipt", e, { receiptId, durationMs: Date.now() - started })
    return { ok: false, error: e instanceof Error ? e.message : "Parse failed" }
  }
}

export async function updateReceipt(
  receiptId: string,
  formData: FormData,
): Promise<void> {
  await requireReceipt(receiptId)

  const vendor = String(formData.get("vendor") ?? "").trim() || null
  const purchasedAtRaw = String(formData.get("purchasedAt") ?? "").trim()
  const purchasedAt = purchasedAtRaw ? new Date(purchasedAtRaw) : null
  const subtotal = formData.has("subtotal") ? parseFloatSafe(formData.get("subtotal")) : null
  const tax = formData.has("tax") ? parseFloatSafe(formData.get("tax")) : null
  const total = formData.has("total") ? parseFloatSafe(formData.get("total")) : null
  const notes = String(formData.get("notes") ?? "").trim() || null

  await prisma.receipt.update({
    where: { id: receiptId },
    data: {
      vendor,
      purchasedAt,
      subtotal,
      tax,
      total,
      notes,
    },
  })
  revalidatePath(`/receipts/${receiptId}`)
}

export async function assignReceiptToProject(
  receiptId: string,
  formData: FormData,
): Promise<void> {
  const { userId, receipt } = await requireReceipt(receiptId)
  const raw = String(formData.get("projectId") ?? "").trim()
  const projectId = raw || null
  if (projectId) {
    const project = await prisma.project.findFirst({ where: { id: projectId, userId } })
    if (!project) throw new Error("Project not found")
  }
  await prisma.receipt.update({
    where: { id: receiptId },
    data: { projectId },
  })
  revalidatePath("/receipts")
  revalidatePath(`/receipts/${receiptId}`)
  if (receipt.projectId) revalidatePath(`/projects/${receipt.projectId}`)
  if (projectId) revalidatePath(`/projects/${projectId}`)
}

export async function deleteReceipt(receiptId: string): Promise<void> {
  const { receipt } = await requireReceipt(receiptId)
  // Best-effort: remove the blob too.
  try {
    if (process.env.BLOB_READ_WRITE_TOKEN) await del(receipt.imageUrl)
  } catch {}
  await prisma.receipt.delete({ where: { id: receiptId } })
  revalidatePath("/receipts")
  if (receipt.projectId) revalidatePath(`/projects/${receipt.projectId}`)
  redirect("/receipts")
}

export async function addReceiptItem(
  receiptId: string,
  formData: FormData,
): Promise<void> {
  await requireReceipt(receiptId)
  const description = String(formData.get("description") ?? "").trim()
  // Empty description is also blocked client-side by `required`. Silent
  // early-return is fine — no UI state to surface a structured error to.
  if (!description) return
  const quantity = parseFloatSafe(formData.get("quantity"), 1)
  const unit = String(formData.get("unit") ?? "ea").trim() || "ea"
  const unitPrice = parseFloatSafe(formData.get("unitPrice"))
  const lineTotalRaw = formData.get("lineTotal")
  const lineTotal = lineTotalRaw !== null && lineTotalRaw !== "" ? Number(lineTotalRaw) : null

  const last = await prisma.receiptItem.findFirst({
    where: { receiptId },
    orderBy: { order: "desc" },
  })
  await prisma.receiptItem.create({
    data: {
      receiptId,
      description,
      quantity,
      unit,
      unitPrice,
      lineTotal: lineTotal !== null && Number.isFinite(lineTotal) ? lineTotal : null,
      order: (last?.order ?? -1) + 1,
    },
  })
  revalidatePath(`/receipts/${receiptId}`)
}

export async function updateReceiptItem(
  receiptId: string,
  itemId: string,
  formData: FormData,
): Promise<void> {
  await requireReceipt(receiptId)
  const item = await prisma.receiptItem.findFirst({
    where: { id: itemId, receiptId },
  })
  if (!item) return
  const description = String(formData.get("description") ?? "").trim()
  if (!description) return
  const quantity = parseFloatSafe(formData.get("quantity"), 1)
  const unit = String(formData.get("unit") ?? "ea").trim() || "ea"
  const unitPrice = parseFloatSafe(formData.get("unitPrice"))
  const lineTotalRaw = formData.get("lineTotal")
  const lineTotal =
    lineTotalRaw !== null && lineTotalRaw !== "" ? Number(lineTotalRaw) : null

  await prisma.receiptItem.update({
    where: { id: itemId },
    data: {
      description,
      quantity,
      unit,
      unitPrice,
      lineTotal: lineTotal !== null && Number.isFinite(lineTotal) ? lineTotal : null,
    },
  })
  revalidatePath(`/receipts/${receiptId}`)
}

export async function deleteReceiptItem(
  receiptId: string,
  itemId: string,
): Promise<void> {
  await requireReceipt(receiptId)
  // Scope on receiptId so we can never delete an item that belongs to a
  // different receipt — even if the form was tampered with.
  await prisma.receiptItem.deleteMany({ where: { id: itemId, receiptId } })
  revalidatePath(`/receipts/${receiptId}`)
}

// ─────────────────────────────────────────────────────────────────────────
// W4 Feature 1 — catalog-update receipts
// previewCatalogUpdates fuzzy-matches the receipt's parsed items against
// the user's catalog so the UI can render three buckets (likely / uncertain
// / new). applyCatalogUpdates atomically applies the contractor's per-row
// decisions: update prices on existing rows, insert new rows, skip the rest.

import {
  scoreAgainstCatalog,
  bucketize,
  type FuzzyCandidate,
} from "@/lib/catalog/fuzzy-match"

import { parseTradeSlug, type TradeSlug } from "@/lib/catalog/trades"

function pickTrade(v: string | null | undefined): TradeSlug {
  return parseTradeSlug(v)
}

export type CatalogUpdatePreview = {
  receiptId: string
  matches: Array<{
    receiptItemId: string
    catalogItemId: string
    description: string
    unit: string
    currentPrice: number
    newPrice: number
    deltaPct: number
    confidence: number
    /** SKU parsed off the receipt line. Null = parser couldn't read it. */
    receiptSku: string | null
    /** SKU already on the catalog row, if any. Null = catalog has no SKU yet. */
    catalogSku: string | null
  }>
  uncertain: Array<{
    receiptItemId: string
    description: string
    unit: string
    parsedPrice: number
    receiptSku: string | null
    candidates: Array<{
      catalogItemId: string
      description: string
      unit: string
      score: number
    }>
  }>
  newItems: Array<{
    receiptItemId: string
    description: string
    unit: string
    suggestedTrade: TradeSlug
    suggestedPrice: number
    /** SKU parsed off the receipt line. Pre-fills the catalog row. */
    receiptSku: string | null
  }>
}

/**
 * Read-only preview: scores every parsed receipt item against the user's
 * catalog and bucketizes by confidence. The action layer doesn't write
 * anything — that's applyCatalogUpdates' job.
 */
export async function previewCatalogUpdates(
  receiptId: string,
): Promise<CatalogUpdatePreview> {
  const { receipt, userId } = await requireReceipt(receiptId)

  const [items, catalog] = await Promise.all([
    prisma.receiptItem.findMany({
      where: { receiptId },
      orderBy: { order: "asc" },
    }),
    prisma.catalogItem.findMany({
      where: { userId, archived: false },
      select: {
        id: true,
        description: true,
        unit: true,
        unitPrice: true,
        trade: true,
        hdSku: true,
      },
    }),
  ])

  void receipt // touched to confirm ownership

  const candidates: FuzzyCandidate[] = catalog.map((c) => ({
    id: c.id,
    description: c.description,
    unit: c.unit,
  }))
  const catalogById = new Map(catalog.map((c) => [c.id, c]))

  const preview: CatalogUpdatePreview = {
    receiptId,
    matches: [],
    uncertain: [],
    newItems: [],
  }

  for (const item of items) {
    const itemPrice =
      item.lineTotal != null && item.quantity > 0
        ? item.lineTotal / item.quantity
        : item.unitPrice
    const scores = scoreAgainstCatalog(
      { description: item.description, unit: item.unit },
      candidates,
    )
    const top = scores[0]
    const bucket = top ? bucketize(top.score) : "new"

    if (bucket === "likely" && top) {
      const cat = catalogById.get(top.candidateId)!
      const deltaPct =
        cat.unitPrice > 0 ? ((itemPrice - cat.unitPrice) / cat.unitPrice) * 100 : 0
      preview.matches.push({
        receiptItemId: item.id,
        catalogItemId: cat.id,
        description: item.description,
        unit: item.unit,
        currentPrice: cat.unitPrice,
        newPrice: itemPrice,
        deltaPct,
        confidence: top.score,
        receiptSku: item.sku,
        catalogSku: cat.hdSku,
      })
    } else if (bucket === "uncertain") {
      preview.uncertain.push({
        receiptItemId: item.id,
        description: item.description,
        unit: item.unit,
        parsedPrice: itemPrice,
        receiptSku: item.sku,
        candidates: scores
          .filter((s) => s.score >= 0.3)
          .slice(0, 5)
          .map((s) => {
            const c = catalogById.get(s.candidateId)!
            return {
              catalogItemId: c.id,
              description: c.description,
              unit: c.unit,
              score: s.score,
            }
          }),
      })
    } else {
      // No reasonable match — candidate for a brand-new catalog row.
      preview.newItems.push({
        receiptItemId: item.id,
        description: item.description,
        unit: item.unit,
        suggestedTrade: "finish",
        suggestedPrice: itemPrice,
        receiptSku: item.sku,
      })
    }
  }

  return preview
}

/**
 * Atomically apply per-row decisions from the review UI. Writes are
 * scoped to the user (catalog ownership) and the receipt is marked
 * reviewed at the end.
 */
export type CatalogUpdateDecision =
  | {
      action: "update-price"
      receiptItemId: string
      catalogItemId: string
      newPrice: number
      /**
       * Optional. When set AND the catalog row currently has no
       * hdSku (or has the same one), write this through. We never
       * silently overwrite a different existing SKU — that case is
       * surfaced in the review UI with a conflict warning so the user
       * picks explicitly.
       */
      hdSku?: string | null
    }
  | {
      action: "add-new"
      receiptItemId: string
      description: string
      unit: string
      trade: string
      price: number
      /** SKU to set on the new catalog row. Null/undefined = leave empty. */
      hdSku?: string | null
    }
  | { action: "skip"; receiptItemId: string }

export async function applyCatalogUpdates(
  receiptId: string,
  decisions: CatalogUpdateDecision[],
): Promise<{ ok: boolean; updatedCount: number; createdCount: number; error?: string }> {
  const { userId } = await requireReceipt(receiptId)

  let updatedCount = 0
  let createdCount = 0
  try {
    await prisma.$transaction(async (tx) => {
      for (const d of decisions) {
        if (d.action === "update-price") {
          // Scope on userId so a tampered catalogItemId can't write to
          // another user's catalog.
          const data: { unitPrice: number; hdSku?: string } = {
            unitPrice: Math.max(0, d.newPrice),
          }
          // Only write hdSku when the caller asked AND the catalog row
          // currently has no SKU. This avoids silently clobbering a
          // user-entered SKU with one parsed off a faded receipt; the
          // review UI surfaces conflicts before we get here.
          if (d.hdSku && d.hdSku.trim()) {
            const existing = await tx.catalogItem.findFirst({
              where: { id: d.catalogItemId, userId, archived: false },
              select: { hdSku: true },
            })
            if (existing && (!existing.hdSku || existing.hdSku === d.hdSku.trim())) {
              data.hdSku = d.hdSku.trim()
            }
          }
          const result = await tx.catalogItem.updateMany({
            where: { id: d.catalogItemId, userId, archived: false },
            data,
          })
          if (result.count > 0) updatedCount += result.count
        } else if (d.action === "add-new") {
          await tx.catalogItem.create({
            data: {
              userId,
              trade: pickTrade(d.trade),
              description: d.description.trim() || "Untitled item",
              unit: (d.unit || "ea").trim() || "ea",
              unitPrice: Math.max(0, d.price),
              kind: "material",
              hdSku: d.hdSku?.trim() || null,
            },
          })
          createdCount++
        }
        // skip → no write
      }
      await tx.receipt.updateMany({
        where: { id: receiptId, userId },
        data: { catalogReviewedAt: new Date() },
      })
    })
  } catch (e) {
    logError("applyCatalogUpdates", e, { receiptId, userId })
    return {
      ok: false,
      updatedCount,
      createdCount,
      error: e instanceof Error ? e.message : "Failed",
    }
  }

  revalidatePath(`/receipts/${receiptId}`)
  revalidatePath("/receipts")
  revalidatePath("/catalog/services")
  revalidatePath("/catalog/materials")
  logInfo("applyCatalogUpdates", "Applied catalog updates", {
    receiptId,
    userId,
    updatedCount,
    createdCount,
    skipped: decisions.filter((d) => d.action === "skip").length,
  })
  return { ok: true, updatedCount, createdCount }
}
