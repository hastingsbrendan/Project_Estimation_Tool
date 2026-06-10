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

/**
 * Clone a project's structure (sections, line items, rooms, proposal
 * scaffolding) into a new project. Powers three flows with one body:
 *   duplicateProject      — straight copy ("Copy of X", keeps client)
 *   saveAsTemplate        — copy flagged isTemplate, client data stripped
 *   createFromTemplate    — copy of a template as a fresh draft project
 */
async function cloneProject(args: {
  userId: string
  sourceId: string
  name: string
  asTemplate: boolean
  keepClient: boolean
}): Promise<{ id: string }> {
  const { userId, sourceId } = args
  const original = await prisma.project.findFirst({
    where: { id: sourceId, userId },
    include: {
      sections: { include: { lineItems: true }, orderBy: { order: "asc" } },
      rooms: { orderBy: { order: "asc" } },
    },
  })
  if (!original) throw new Error("Project not found")

  // Create the new project as a single transactional unit so we don't end
  // up with partial data on failure.
  return prisma.$transaction(async (tx) => {
    const newProject = await tx.project.create({
      data: {
        userId,
        name: args.name,
        clientName: args.keepClient ? original.clientName : null,
        clientEmail: args.keepClient ? original.clientEmail : null,
        address: args.keepClient ? original.address : null,
        notes: original.notes,
        scope: original.scope,
        exclusions: original.exclusions,
        paymentSchedule: original.paymentSchedule,
        markupPct: original.markupPct,
        taxRate: original.taxRate,
        status: "draft", // always start the copy as draft
        isTemplate: args.asTemplate,
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
}

export async function duplicateProject(projectId: string): Promise<void> {
  const userId = await requireUserId()
  const original = await prisma.project.findFirst({
    where: { id: projectId, userId },
    select: { name: true },
  })
  if (!original) throw new Error("Project not found")
  const copy = await cloneProject({
    userId,
    sourceId: projectId,
    name: `Copy of ${original.name}`,
    asTemplate: false,
    keepClient: true,
  })
  revalidatePath("/projects")
  redirect(`/projects/${copy.id}`)
}

/**
 * Snapshot this project's structure as a reusable template. Client
 * fields are stripped — a template is a starting point, not a record.
 */
export async function saveAsTemplate(projectId: string): Promise<void> {
  const userId = await requireUserId()
  const original = await prisma.project.findFirst({
    where: { id: projectId, userId },
    select: { name: true },
  })
  if (!original) throw new Error("Project not found")
  await cloneProject({
    userId,
    sourceId: projectId,
    name: original.name.replace(/\s*\(template\)\s*$/i, ""),
    asTemplate: true,
    keepClient: false,
  })
  revalidatePath("/projects")
  redirect("/projects?view=templates")
}

/** Start a fresh draft project from a template. */
export async function createFromTemplate(templateId: string): Promise<void> {
  const userId = await requireUserId()
  const template = await prisma.project.findFirst({
    where: { id: templateId, userId, isTemplate: true },
    select: { name: true },
  })
  if (!template) throw new Error("Template not found")
  const project = await cloneProject({
    userId,
    sourceId: templateId,
    name: template.name,
    asTemplate: false,
    keepClient: false,
  })
  revalidatePath("/projects")
  redirect(`/projects/${project.id}`)
}

/** Delete a template (same as deleteProject but stays on the templates tab). */
export async function deleteTemplate(templateId: string): Promise<void> {
  const userId = await requireUserId()
  const template = await prisma.project.findFirst({
    where: { id: templateId, userId, isTemplate: true },
  })
  if (!template) throw new Error("Template not found")
  await prisma.project.delete({ where: { id: templateId } })
  revalidatePath("/projects")
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
