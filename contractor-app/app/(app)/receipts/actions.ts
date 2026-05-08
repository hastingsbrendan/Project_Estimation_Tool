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

    const projectId = String(formData.get("projectId") ?? "").trim() || null
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
      },
    })

    revalidatePath("/receipts")
    if (projectId) revalidatePath(`/projects/${projectId}`)
    logInfo("uploadReceipt", "Uploaded receipt", {
      userId,
      receiptId: receipt.id,
      projectId,
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
