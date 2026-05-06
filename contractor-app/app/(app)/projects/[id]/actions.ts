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
    },
  })
  revalidatePath(`/projects/${projectId}`)
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
  const markupPct = Number(formData.get("markupPct") ?? 0)
  const taxRate = Number(formData.get("taxRate") ?? 0)

  await prisma.project.update({
    where: { id: projectId },
    data: {
      ...(name && { name }),
      clientName,
      clientEmail,
      address,
      markupPct: Number.isFinite(markupPct) ? markupPct : 0,
      taxRate: Number.isFinite(taxRate) ? taxRate : 0,
    },
  })
  revalidatePath(`/projects/${projectId}`)
}
