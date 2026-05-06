"use server"

import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { CATALOG_SEED } from "@/seeds/catalog"

async function requireUserId(): Promise<string> {
  const session = await auth()
  if (!session?.user?.email) throw new Error("Unauthorized")
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) throw new Error("User not found")
  return user.id
}

const ALLOWED_TRADES = [
  "demo",
  "framing",
  "plumbing",
  "electrical",
  "drywall",
  "finish",
] as const
type Trade = (typeof ALLOWED_TRADES)[number]

function parseTrade(v: FormDataEntryValue | null): Trade {
  const s = String(v ?? "").trim().toLowerCase()
  return (ALLOWED_TRADES as readonly string[]).includes(s) ? (s as Trade) : "finish"
}

function parseKind(v: FormDataEntryValue | null): "material" | "labor" {
  return String(v ?? "").trim().toLowerCase() === "labor" ? "labor" : "material"
}

function parseFloatSafe(v: FormDataEntryValue | null, fallback = 0): number {
  const n = Number(v ?? fallback)
  return Number.isFinite(n) ? n : fallback
}

export async function createCatalogItem(formData: FormData): Promise<void> {
  const userId = await requireUserId()
  const description = String(formData.get("description") ?? "").trim()
  if (!description) throw new Error("Description is required")

  await prisma.catalogItem.create({
    data: {
      userId,
      description,
      trade: parseTrade(formData.get("trade")),
      unit: String(formData.get("unit") ?? "ea").trim() || "ea",
      unitPrice: parseFloatSafe(formData.get("unitPrice")),
      kind: parseKind(formData.get("kind")),
      notes: String(formData.get("notes") ?? "").trim() || null,
    },
  })
  revalidatePath("/catalog")
}

export async function updateCatalogItem(itemId: string, formData: FormData): Promise<void> {
  const userId = await requireUserId()
  const item = await prisma.catalogItem.findFirst({ where: { id: itemId, userId } })
  if (!item) throw new Error("Item not found")

  const description = String(formData.get("description") ?? "").trim()
  if (!description) return

  await prisma.catalogItem.update({
    where: { id: itemId },
    data: {
      description,
      trade: parseTrade(formData.get("trade")),
      unit: String(formData.get("unit") ?? "ea").trim() || "ea",
      unitPrice: parseFloatSafe(formData.get("unitPrice")),
      kind: parseKind(formData.get("kind")),
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
 */
export async function loadDefaultCatalog(): Promise<void> {
  const userId = await requireUserId()

  const existing = await prisma.catalogItem.findMany({
    where: { userId },
    select: { description: true, trade: true },
  })
  const have = new Set(existing.map((i) => `${i.trade}::${i.description}`))

  const toInsert = CATALOG_SEED.filter(
    (s) => !have.has(`${s.trade}::${s.description}`),
  )

  if (toInsert.length === 0) {
    revalidatePath("/catalog")
    return
  }

  await prisma.catalogItem.createMany({
    data: toInsert.map((s) => ({
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
