"use server"

import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { CATALOG_SEED } from "@/seeds/catalog"
import { requireUserId } from "@/lib/auth-helpers"
import { seedDefaultCatalogForUser } from "@/lib/seed-default-catalog"
import { parseTradeSlug } from "@/lib/catalog/trades"

function parseTrade(v: FormDataEntryValue | null): string {
  return parseTradeSlug(v == null ? null : String(v))
}

function parseKind(v: FormDataEntryValue | null): "material" | "labor" {
  return String(v ?? "").trim().toLowerCase() === "labor" ? "labor" : "material"
}

function parseFloatSafe(v: FormDataEntryValue | null, fallback = 0): number {
  const n = Number(v ?? fallback)
  return Number.isFinite(n) ? n : fallback
}

/**
 * SKU input from the catalog UI. Trim, drop empty → null. We don't
 * validate the format because Home Depot has at least three SKU
 * conventions (8-digit, 10-digit OMSID, store SKU) plus the user
 * may want to paste in Lowe's / vendor SKUs later.
 */
function parseSku(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim()
  return s.length > 0 ? s : null
}

export async function createCatalogItem(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const userId = await requireUserId()
  const description = String(formData.get("description") ?? "").trim()
  if (!description) return { ok: false, error: "Description is required" }

  await prisma.catalogItem.create({
    data: {
      userId,
      description,
      trade: parseTrade(formData.get("trade")),
      unit: String(formData.get("unit") ?? "ea").trim() || "ea",
      unitPrice: parseFloatSafe(formData.get("unitPrice")),
      kind: parseKind(formData.get("kind")),
      hdSku: parseSku(formData.get("hdSku")),
      notes: String(formData.get("notes") ?? "").trim() || null,
    },
  })
  revalidatePath("/catalog")
  return { ok: true }
}

export async function updateCatalogItem(itemId: string, formData: FormData): Promise<void> {
  const userId = await requireUserId()
  const item = await prisma.catalogItem.findFirst({ where: { id: itemId, userId } })
  if (!item) throw new Error("Item not found")

  const description = String(formData.get("description") ?? "").trim()
  if (!description) return

  // SKU is only included in the update if the form sent it. AutoSaveForm
  // posts the whole row, so absent = "field not on this form" rather
  // than "user cleared it." parseSku("") is null, which DOES clear it.
  const skuField = formData.get("hdSku")
  await prisma.catalogItem.update({
    where: { id: itemId },
    data: {
      description,
      trade: parseTrade(formData.get("trade")),
      unit: String(formData.get("unit") ?? "ea").trim() || "ea",
      unitPrice: parseFloatSafe(formData.get("unitPrice")),
      kind: parseKind(formData.get("kind")),
      ...(skuField !== null ? { hdSku: parseSku(skuField) } : {}),
      notes: String(formData.get("notes") ?? "").trim() || null,
    },
  })
  revalidatePath("/catalog")
}

export async function deleteCatalogItem(itemId: string): Promise<void> {
  const userId = await requireUserId()
  const item = await prisma.catalogItem.findFirst({ where: { id: itemId, userId } })
  if (!item) throw new Error("Item not found")
  await prisma.catalogItem.delete({ where: { id: itemId } })
  revalidatePath("/catalog")
}

/**
 * Bulk-load the static default catalog (300 items) for this user.
 * Skips items the user already has at exact (description, trade) match,
 * so re-running the action is safe and additive.
 *
 * The same seeding logic runs automatically on first sign-in via Auth.js
 * `events.createUser` (see auth.ts). This action exists for the manual
 * "Update dummy catalog" banner / button.
 */
export async function loadDefaultCatalog(): Promise<void> {
  const userId = await requireUserId()
  await seedDefaultCatalogForUser(userId)
  revalidatePath("/catalog")
  revalidatePath("/catalog/services")
  revalidatePath("/catalog/materials")
}

/**
 * Add a material to a service's preset bundle. Both items must be owned
 * by the user; both kinds are validated. UNIQUE(serviceId, materialId)
 * means re-adding a duplicate is a no-op (we catch and ignore it).
 */
export async function addPreset(
  serviceId: string,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const userId = await requireUserId()

  const service = await prisma.catalogItem.findFirst({
    where: { id: serviceId, userId },
  })
  if (!service) return { ok: false, error: "Service not found" }
  if (service.kind !== "labor") {
    return { ok: false, error: "Presets can only be added to labor items" }
  }

  const materialId = String(formData.get("materialId") ?? "").trim()
  if (!materialId) return { ok: false, error: "Pick a material" }

  const material = await prisma.catalogItem.findFirst({
    where: { id: materialId, userId },
  })
  if (!material) return { ok: false, error: "Material not found" }
  if (material.kind !== "material") {
    return { ok: false, error: "Suggested item must be a material" }
  }

  const defaultQty = parseFloatSafe(formData.get("defaultQty"), 1)
  const notes = String(formData.get("notes") ?? "").trim() || null

  try {
    await prisma.catalogPreset.create({
      data: { serviceId, materialId, defaultQty, notes },
    })
  } catch (e) {
    // Likely UNIQUE collision — already linked. Idempotent.
    const msg = e instanceof Error ? e.message : ""
    if (!msg.toLowerCase().includes("unique")) {
      return { ok: false, error: msg || "Failed to save preset" }
    }
  }
  revalidatePath("/catalog")
  return { ok: true }
}

export async function updatePreset(
  presetId: string,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const userId = await requireUserId()
  const preset = await prisma.catalogPreset.findUnique({
    where: { id: presetId },
    include: { service: true },
  })
  if (!preset || preset.service.userId !== userId) {
    return { ok: false, error: "Preset not found" }
  }
  const defaultQty = parseFloatSafe(formData.get("defaultQty"), 1)
  const notes = String(formData.get("notes") ?? "").trim() || null
  await prisma.catalogPreset.update({
    where: { id: presetId },
    data: { defaultQty, notes },
  })
  revalidatePath("/catalog")
  return { ok: true }
}

export async function removePreset(presetId: string): Promise<void> {
  const userId = await requireUserId()
  const preset = await prisma.catalogPreset.findUnique({
    where: { id: presetId },
    include: { service: true },
  })
  if (!preset || preset.service.userId !== userId) return
  await prisma.catalogPreset.delete({ where: { id: presetId } })
  revalidatePath("/catalog")
}

/**
 * Wipe the user's entire catalog and replace with the static defaults.
 * Destructive — line items that referenced these catalog items will have
 * their catalogItemId set to NULL (kept intact via SET NULL on FK), so
 * existing project line items are preserved.
 */
export async function resetCatalogToDefaults(): Promise<void> {
  const userId = await requireUserId()
  await prisma.catalogItem.deleteMany({ where: { userId } })
  await prisma.catalogItem.createMany({
    data: CATALOG_SEED.map((s) => ({
      userId,
      trade: s.trade,
      description: s.description,
      unit: s.unit,
      unitPrice: s.unitPrice,
      kind: s.kind,
    })),
  })
  revalidatePath("/catalog")
}
