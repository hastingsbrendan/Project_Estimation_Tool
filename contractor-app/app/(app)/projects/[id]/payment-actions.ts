"use server"

import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { requireProject } from "@/lib/auth-helpers"
import { calcEstimate } from "@/lib/calc"
import { parsePaymentSchedule } from "@/lib/milestones"
import { logError } from "@/lib/log"

/**
 * Payment-milestone actions. Milestones are the invoicing spine:
 * generated from the freeform paymentSchedule text (or added by hand),
 * each can produce an invoice PDF and be marked paid. The Today
 * dashboard and the job P&L card both read them.
 */

export async function generateMilestonesFromSchedule(
  projectId: string,
): Promise<void> {
  try {
    await requireProject(projectId)
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        sections: { include: { lineItems: true } },
        milestones: { select: { id: true } },
      },
    })
    if (!project) throw new Error("Project not found")
    // Only generate into an empty list — never clobber rows the
    // contractor may have edited or marked paid.
    if (project.milestones.length > 0) return

    const lineItems = project.sections.flatMap((s) =>
      s.lineItems.map((li) => ({
        quantity: li.quantity,
        unitPrice: li.unitPrice,
        kind: li.kind as "material" | "labor",
      })),
    )
    const total = calcEstimate({
      lineItems,
      markupPct: project.markupPct,
      taxRate: project.taxRate,
    }).total

    const parsed = parsePaymentSchedule(project.paymentSchedule, total)
    if (parsed.length === 0) return

    await prisma.milestone.createMany({
      data: parsed.map((m, i) => ({
        projectId,
        label: m.label,
        amount: m.amount,
        order: i,
      })),
    })
  } catch (e) {
    logError("generateMilestonesFromSchedule", e, { projectId })
    throw e
  }
  revalidatePath(`/projects/${projectId}`)
}

export async function addMilestone(
  projectId: string,
  formData: FormData,
): Promise<void> {
  try {
    await requireProject(projectId)
    const label = String(formData.get("label") ?? "").trim()
    if (!label) return
    const amount = Number(formData.get("amount") ?? 0)
    const count = await prisma.milestone.count({ where: { projectId } })
    await prisma.milestone.create({
      data: {
        projectId,
        label,
        amount: Number.isFinite(amount) ? Math.max(0, amount) : 0,
        order: count,
      },
    })
  } catch (e) {
    logError("addMilestone", e, { projectId })
    throw e
  }
  revalidatePath(`/projects/${projectId}`)
}

export async function updateMilestone(
  projectId: string,
  milestoneId: string,
  formData: FormData,
): Promise<void> {
  try {
    await requireProject(projectId)
    const label = String(formData.get("label") ?? "").trim()
    const amount = Number(formData.get("amount") ?? 0)
    await prisma.milestone.updateMany({
      where: { id: milestoneId, projectId },
      data: {
        ...(label ? { label } : {}),
        amount: Number.isFinite(amount) ? Math.max(0, amount) : 0,
      },
    })
  } catch (e) {
    logError("updateMilestone", e, { projectId, milestoneId })
    throw e
  }
  revalidatePath(`/projects/${projectId}`)
}

export async function deleteMilestone(
  projectId: string,
  milestoneId: string,
): Promise<void> {
  try {
    await requireProject(projectId)
    await prisma.milestone.deleteMany({ where: { id: milestoneId, projectId } })
  } catch (e) {
    logError("deleteMilestone", e, { projectId, milestoneId })
    throw e
  }
  revalidatePath(`/projects/${projectId}`)
}

/** Toggle paid state. Paid milestones record paidAt = now. */
export async function toggleMilestonePaid(
  projectId: string,
  milestoneId: string,
): Promise<void> {
  try {
    await requireProject(projectId)
    const m = await prisma.milestone.findFirst({
      where: { id: milestoneId, projectId },
      select: { paidAt: true },
    })
    if (!m) return
    await prisma.milestone.update({
      where: { id: milestoneId },
      data: { paidAt: m.paidAt ? null : new Date() },
    })
  } catch (e) {
    logError("toggleMilestonePaid", e, { projectId, milestoneId })
    throw e
  }
  revalidatePath(`/projects/${projectId}`)
  revalidatePath("/today")
}
