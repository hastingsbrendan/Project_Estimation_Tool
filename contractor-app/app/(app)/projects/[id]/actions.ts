"use server"

import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"

async function requireProject(projectId: string) {
  const session = await auth()
  if (!session?.user?.email) throw new Error("Unauthorized")
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) throw new Error("User not found")
  const project = await prisma.project.findFirst({ where: { id: projectId, userId: user.id } })
  if (!project) throw new Error("Project not found")
  return project
}

export async function addSection(projectId: string, formData: FormData): Promise<void> {
  await requireProject(projectId)
  const name = String(formData.get("name") ?? "").trim() || "New section"
  const last = await prisma.section.findFirst({
    where: { projectId },
    orderBy: { order: "desc" },
  })
  await prisma.section.create({
    data: { name, projectId, order: (last?.order ?? -1) + 1 },
  })
  revalidatePath(`/projects/${projectId}`)
}

export async function renameSection(
  projectId: string,
  sectionId: string,
  formData: FormData,
): Promise<void> {
  await requireProject(projectId)
  const name = String(formData.get("name") ?? "").trim()
  if (!name) return
  await prisma.section.update({ where: { id: sectionId }, data: { name } })
  revalidatePath(`/projects/${projectId}`)
}

export async function deleteSection(projectId: string, sectionId: string): Promise<void> {
  await requireProject(projectId)
  await prisma.section.delete({ where: { id: sectionId } })
  revalidatePath(`/projects/${projectId}`)
}

export type AddLineItemResult = {
  lineItemId: string
  description: string
  kind: "material" | "labor"
  /** Empty unless the new line item is a service with at least one catalog preset. */
  suggestedPresets: Array<{
    presetId: string
    materialId: string
    materialDescription: string
    materialUnit: string
    materialUnitPrice: number
    defaultQty: number
  }>
}

export async function addLineItem(
  projectId: string,
  sectionId: string,
  formData: FormData,
): Promise<AddLineItemResult> {
  await requireProject(projectId)

  const description = String(formData.get("description") ?? "").trim()
  if (!description) throw new Error("Description is required")

  const quantity = Number(formData.get("quantity") ?? 1)
  const unit = String(formData.get("unit") ?? "ea").trim() || "ea"
  const unitPrice = Number(formData.get("unitPrice") ?? 0)
  const kindRaw = String(formData.get("kind") ?? "material")
  const kind = kindRaw === "labor" ? "labor" : "material"
  const catalogItemId = String(formData.get("catalogItemId") ?? "").trim() || null

  const last = await prisma.lineItem.findFirst({
    where: { sectionId },
    orderBy: { order: "desc" },
  })

  const created = await prisma.lineItem.create({
    data: {
      description,
      quantity: Number.isFinite(quantity) ? quantity : 1,
      unit,
      unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
      kind,
      sectionId,
      order: (last?.order ?? -1) + 1,
      catalogItemId,
    },
  })
  revalidatePath(`/projects/${projectId}`)

  // If this was a labor line item linked to a catalog service, surface its
  // presets to the client so it can offer a one-click "add suggested
  // materials" panel below the new row.
  let suggestedPresets: AddLineItemResult["suggestedPresets"] = []
  if (kind === "labor" && catalogItemId) {
    const presets = await prisma.catalogPreset.findMany({
      where: { serviceId: catalogItemId },
      include: { material: true },
      orderBy: { material: { description: "asc" } },
    })
    suggestedPresets = presets.map((p) => ({
      presetId: p.id,
      materialId: p.materialId,
      materialDescription: p.material.description,
      materialUnit: p.material.unit,
      materialUnitPrice: p.material.unitPrice,
      defaultQty: p.defaultQty,
    }))
  }

  return { lineItemId: created.id, description, kind, suggestedPresets }
}

/**
 * Atomic bulk-insert: pass an array of presetId+qty for the materials the
 * user picked from the suggestion panel. Each becomes a new LineItem in the
 * given section, linked to its catalog material via catalogItemId so the
 * existing "Refresh prices" feature continues to work.
 */
export async function applyServicePresets(
  projectId: string,
  sectionId: string,
  picks: Array<{ presetId: string; quantity: number }>,
): Promise<{ added: number }> {
  await requireProject(projectId)

  if (picks.length === 0) return { added: 0 }

  // Fetch all presets in one go and verify they belong to a catalog item
  // owned by the current user (already guarded by requireProject scoping +
  // the catalog ownership chain via CatalogItem.userId).
  const presetIds = picks.map((p) => p.presetId)
  const presets = await prisma.catalogPreset.findMany({
    where: { id: { in: presetIds } },
    include: { material: true, service: true },
  })

  // Drop any preset whose material isn't owned by the project's user.
  const project = await prisma.project.findUnique({ where: { id: projectId } })
  if (!project) throw new Error("Project not found")
  const ownedPresets = presets.filter(
    (p) => p.material.userId === project.userId && p.service.userId === project.userId,
  )

  // Compute the next order index and bulk-insert in one go.
  const last = await prisma.lineItem.findFirst({
    where: { sectionId },
    orderBy: { order: "desc" },
  })
  let nextOrder = (last?.order ?? -1) + 1

  // Build the full insert list, preserving the user's pick order.
  const presetById = new Map(ownedPresets.map((p) => [p.id, p]))
  const rows: Array<{
    description: string
    quantity: number
    unit: string
    unitPrice: number
    kind: string
    sectionId: string
    order: number
    catalogItemId: string
  }> = []
  for (const pick of picks) {
    const preset = presetById.get(pick.presetId)
    if (!preset) continue
    const qty = Number.isFinite(pick.quantity) && pick.quantity > 0 ? pick.quantity : preset.defaultQty
    rows.push({
      description: preset.material.description,
      quantity: qty,
      unit: preset.material.unit,
      unitPrice: preset.material.unitPrice,
      kind: "material",
      sectionId,
      order: nextOrder++,
      catalogItemId: preset.materialId,
    })
  }

  if (rows.length === 0) return { added: 0 }

  await prisma.lineItem.createMany({ data: rows })
  revalidatePath(`/projects/${projectId}`)
  return { added: rows.length }
}

/**
 * Refresh prices on every line item that was originally picked from the
 * catalog (catalogItemId is set). Returns the count of items updated, so
 * the caller can show a toast.
 */
export async function refreshPricesFromCatalog(projectId: string): Promise<{ updated: number }> {
  const project = await requireProject(projectId)

  const linkedItems = await prisma.lineItem.findMany({
    where: {
      catalogItemId: { not: null },
      section: { projectId: project.id },
    },
    include: { catalogItem: true },
  })

  let updated = 0
  for (const item of linkedItems) {
    if (!item.catalogItem) continue
    const cat = item.catalogItem
    if (
      item.unitPrice === cat.unitPrice &&
      item.unit === cat.unit &&
      item.kind === cat.kind
    ) {
      continue
    }
    await prisma.lineItem.update({
      where: { id: item.id },
      data: {
        unitPrice: cat.unitPrice,
        unit: cat.unit,
        kind: cat.kind,
      },
    })
    updated++
  }
  revalidatePath(`/projects/${projectId}`)
  return { updated }
}

export async function updateLineItem(
  projectId: string,
  lineItemId: string,
  formData: FormData,
): Promise<void> {
  await requireProject(projectId)

  const description = String(formData.get("description") ?? "").trim()
  if (!description) return

  const quantity = Number(formData.get("quantity") ?? 1)
  const unit = String(formData.get("unit") ?? "ea").trim() || "ea"
  const unitPrice = Number(formData.get("unitPrice") ?? 0)
  const kindRaw = String(formData.get("kind") ?? "material")
  const kind = kindRaw === "labor" ? "labor" : "material"

  await prisma.lineItem.update({
    where: { id: lineItemId },
    data: {
      description,
      quantity: Number.isFinite(quantity) ? quantity : 1,
      unit,
      unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
      kind,
    },
  })
  revalidatePath(`/projects/${projectId}`)
}

export async function deleteLineItem(projectId: string, lineItemId: string): Promise<void> {
  await requireProject(projectId)
  await prisma.lineItem.delete({ where: { id: lineItemId } })
  revalidatePath(`/projects/${projectId}`)
}

export async function updateProjectMeta(
  projectId: string,
  formData: FormData,
): Promise<void> {
  await requireProject(projectId)

  const name = String(formData.get("name") ?? "").trim()
  const clientName = String(formData.get("clientName") ?? "").trim() || null
  const clientEmail = String(formData.get("clientEmail") ?? "").trim() || null
  const address = String(formData.get("address") ?? "").trim() || null
  const notes = String(formData.get("notes") ?? "").trim() || null
  const markupPct = Number(formData.get("markupPct") ?? 0)
  const taxRate = Number(formData.get("taxRate") ?? 0)
  const statusRaw = String(formData.get("status") ?? "")
  const allowedStatuses = ["draft", "sent", "accepted", "rejected", "won", "lost"] as const
  const status = (allowedStatuses as readonly string[]).includes(statusRaw)
    ? statusRaw
    : undefined

  await prisma.project.update({
    where: { id: projectId },
    data: {
      ...(name && { name }),
      clientName,
      clientEmail,
      address,
      notes,
      markupPct: Number.isFinite(markupPct) ? markupPct : 0,
      taxRate: Number.isFinite(taxRate) ? taxRate : 0,
      ...(status && { status }),
    },
  })
  revalidatePath(`/projects/${projectId}`)
}

export async function updateProposalContent(
  projectId: string,
  formData: FormData,
): Promise<void> {
  await requireProject(projectId)
  const scope = String(formData.get("scope") ?? "").trim() || null
  const exclusions = String(formData.get("exclusions") ?? "").trim() || null
  const paymentSchedule = String(formData.get("paymentSchedule") ?? "").trim() || null
  await prisma.project.update({
    where: { id: projectId },
    data: { scope, exclusions, paymentSchedule },
  })
  revalidatePath(`/projects/${projectId}`)
  revalidatePath(`/projects/${projectId}/proposal`)
}

/**
 * Move a section up (-1) or down (+1) by swapping `order` with its neighbor.
 */
export async function moveSection(
  projectId: string,
  sectionId: string,
  direction: "up" | "down",
): Promise<void> {
  await requireProject(projectId)
  const section = await prisma.section.findUnique({ where: { id: sectionId } })
  if (!section || section.projectId !== projectId) return

  const neighbor = await prisma.section.findFirst({
    where: {
      projectId,
      order: direction === "up" ? { lt: section.order } : { gt: section.order },
    },
    orderBy: { order: direction === "up" ? "desc" : "asc" },
  })
  if (!neighbor) return

  await prisma.$transaction([
    prisma.section.update({ where: { id: section.id }, data: { order: neighbor.order } }),
    prisma.section.update({ where: { id: neighbor.id }, data: { order: section.order } }),
  ])
  revalidatePath(`/projects/${projectId}`)
}

export async function moveLineItem(
  projectId: string,
  lineItemId: string,
  direction: "up" | "down",
): Promise<void> {
  await requireProject(projectId)
  const item = await prisma.lineItem.findUnique({ where: { id: lineItemId } })
  if (!item) return

  const neighbor = await prisma.lineItem.findFirst({
    where: {
      sectionId: item.sectionId,
      order: direction === "up" ? { lt: item.order } : { gt: item.order },
    },
    orderBy: { order: direction === "up" ? "desc" : "asc" },
  })
  if (!neighbor) return

  await prisma.$transaction([
    prisma.lineItem.update({ where: { id: item.id }, data: { order: neighbor.order } }),
    prisma.lineItem.update({ where: { id: neighbor.id }, data: { order: item.order } }),
  ])
  revalidatePath(`/projects/${projectId}`)
}

/**
 * Replace section order with the supplied id list. Used by drag-and-drop —
 * we recompute order indices to match the new array position.
 */
export async function reorderSections(
  projectId: string,
  sectionIds: string[],
): Promise<void> {
  await requireProject(projectId)
  // Verify every id belongs to this project before writing anything.
  const owned = await prisma.section.findMany({
    where: { projectId },
    select: { id: true },
  })
  const ownedIds = new Set(owned.map((s) => s.id))
  if (!sectionIds.every((id) => ownedIds.has(id))) {
    throw new Error("Section ownership mismatch")
  }
  await prisma.$transaction(
    sectionIds.map((id, i) =>
      prisma.section.update({ where: { id }, data: { order: i } }),
    ),
  )
  revalidatePath(`/projects/${projectId}`)
}

export async function reorderLineItems(
  projectId: string,
  sectionId: string,
  lineItemIds: string[],
): Promise<void> {
  await requireProject(projectId)
  const section = await prisma.section.findFirst({
    where: { id: sectionId, projectId },
  })
  if (!section) throw new Error("Section not found")
  const owned = await prisma.lineItem.findMany({
    where: { sectionId },
    select: { id: true },
  })
  const ownedIds = new Set(owned.map((li) => li.id))
  if (!lineItemIds.every((id) => ownedIds.has(id))) {
    throw new Error("Line item ownership mismatch")
  }
  await prisma.$transaction(
    lineItemIds.map((id, i) =>
      prisma.lineItem.update({ where: { id }, data: { order: i } }),
    ),
  )
  revalidatePath(`/projects/${projectId}`)
}

/**
 * Generate (or rotate) a public read-only share token for this project.
 * Returns the new token so the client can build the URL.
 */
export async function enableShareLink(projectId: string): Promise<{ token: string }> {
  await requireProject(projectId)
  // crypto.randomUUID is on the web platform globally in Node 20+
  const token = crypto.randomUUID().replace(/-/g, "")
  await prisma.project.update({
    where: { id: projectId },
    data: { shareToken: token },
  })
  revalidatePath(`/projects/${projectId}/proposal`)
  return { token }
}

export async function disableShareLink(projectId: string): Promise<void> {
  await requireProject(projectId)
  await prisma.project.update({
    where: { id: projectId },
    data: { shareToken: null },
  })
  revalidatePath(`/projects/${projectId}/proposal`)
}

/**
 * Void a previously-recorded acceptance (e.g. a typo in the typed name).
 * Clears acceptance fields and resets project status if it was auto-flipped
 * to "accepted" — leaves it in "sent" if a proposal was sent, otherwise
 * "draft".
 */
export async function voidAcceptance(projectId: string): Promise<void> {
  const project = await requireProject(projectId)
  await prisma.project.update({
    where: { id: projectId },
    data: {
      acceptedAt: null,
      acceptedBy: null,
      acceptedIp: null,
      acceptedUserAgent: null,
      // If we auto-flipped status to accepted, fall back to sent (or draft).
      ...(project.status === "accepted"
        ? { status: project.proposalSentAt ? "sent" : "draft" }
        : {}),
    },
  })
  revalidatePath(`/projects/${projectId}/proposal`)
  revalidatePath("/projects")
}
