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

export async function addLineItem(
  projectId: string,
  sectionId: string,
  formData: FormData,
): Promise<void> {
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

  await prisma.lineItem.create({
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
