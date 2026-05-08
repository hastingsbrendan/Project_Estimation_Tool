"use server"

import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { requireUserId } from "@/lib/auth-helpers"

export async function createProject(formData: FormData): Promise<void> {
  const userId = await requireUserId()

  const name = String(formData.get("name") ?? "").trim()
  if (!name) throw new Error("Project name is required")

  const clientName = String(formData.get("clientName") ?? "").trim() || null
  const clientEmail = String(formData.get("clientEmail") ?? "").trim() || null
  const address = String(formData.get("address") ?? "").trim() || null

  const project = await prisma.project.create({
    data: {
      name,
      clientName,
      clientEmail,
      address,
      userId,
    },
  })

  revalidatePath("/projects")
  redirect(`/projects/${project.id}`)
}

export async function deleteProject(projectId: string): Promise<void> {
  const userId = await requireUserId()

  // Confirm ownership before delete
  const project = await prisma.project.findFirst({ where: { id: projectId, userId } })
  if (!project) throw new Error("Project not found")

  await prisma.project.delete({ where: { id: projectId } })

  revalidatePath("/projects")
  redirect("/projects")
}

export async function archiveProject(projectId: string): Promise<void> {
  const userId = await requireUserId()
  const project = await prisma.project.findFirst({ where: { id: projectId, userId } })
  if (!project) throw new Error("Project not found")
  await prisma.project.update({ where: { id: projectId }, data: { archived: true } })
  revalidatePath("/projects")
  redirect("/projects")
}

export async function unarchiveProject(projectId: string): Promise<void> {
  const userId = await requireUserId()
  const project = await prisma.project.findFirst({ where: { id: projectId, userId } })
  if (!project) throw new Error("Project not found")
  await prisma.project.update({ where: { id: projectId }, data: { archived: false } })
  revalidatePath("/projects")
  revalidatePath("/projects/archived")
}

export async function duplicateProject(projectId: string): Promise<void> {
  const userId = await requireUserId()

  const original = await prisma.project.findFirst({
    where: { id: projectId, userId },
    include: {
      sections: { include: { lineItems: true }, orderBy: { order: "asc" } },
      rooms: { orderBy: { order: "asc" } },
    },
  })
  if (!original) throw new Error("Project not found")

  // Create the new project as a single transactional unit so we don't end
  // up with partial data on failure.
  const copy = await prisma.$transaction(async (tx) => {
    const newProject = await tx.project.create({
      data: {
        userId,
        name: `Copy of ${original.name}`,
        clientName: original.clientName,
        clientEmail: original.clientEmail,
        address: original.address,
        notes: original.notes,
        scope: original.scope,
        exclusions: original.exclusions,
        paymentSchedule: original.paymentSchedule,
        markupPct: original.markupPct,
        taxRate: original.taxRate,
        status: "draft", // always start the copy as draft
      },
    })

    for (const section of original.sections) {
      const newSection = await tx.section.create({
        data: {
          projectId: newProject.id,
          name: section.name,
          order: section.order,
        },
      })
      if (section.lineItems.length > 0) {
        await tx.lineItem.createMany({
          data: section.lineItems.map((li) => ({
            sectionId: newSection.id,
            description: li.description,
            quantity: li.quantity,
            unit: li.unit,
            unitPrice: li.unitPrice,
            kind: li.kind,
            order: li.order,
            catalogItemId: li.catalogItemId,
          })),
        })
      }
    }

    if (original.rooms.length > 0) {
      await tx.room.createMany({
        data: original.rooms.map((r) => ({
          projectId: newProject.id,
          name: r.name,
          lengthFt: r.lengthFt,
          widthFt: r.widthFt,
          heightFt: r.heightFt,
          notes: r.notes,
          order: r.order,
        })),
      })
    }

    return newProject
  })

  revalidatePath("/projects")
  redirect(`/projects/${copy.id}`)
}

export async function updateProjectSettings(
  projectId: string,
  formData: FormData,
): Promise<void> {
  const userId = await requireUserId()

  const project = await prisma.project.findFirst({ where: { id: projectId, userId } })
  if (!project) throw new Error("Project not found")

  const markupPct = Number(formData.get("markupPct") ?? 0)
  const taxRate = Number(formData.get("taxRate") ?? 0)

  await prisma.project.update({
    where: { id: projectId },
    data: {
      markupPct: Number.isFinite(markupPct) ? markupPct : 0,
      taxRate: Number.isFinite(taxRate) ? taxRate : 0,
    },
  })

  revalidatePath(`/projects/${projectId}`)
}
