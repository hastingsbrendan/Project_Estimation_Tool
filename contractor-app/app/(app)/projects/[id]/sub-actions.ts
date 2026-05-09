"use server"

import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { requireProject, requireUserId } from "@/lib/auth-helpers"
import { logError, logInfo } from "@/lib/log"
import { rateSubcontractor as rateSub } from "../../subs/rating-actions"

const ALLOWED_STATUSES = new Set([
  "invited",
  "confirmed",
  "onsite",
  "done",
  "cancelled",
])

function parseStatus(v: FormDataEntryValue | null, fallback = "invited"): string {
  const s = String(v ?? fallback).toLowerCase()
  return ALLOWED_STATUSES.has(s) ? s : fallback
}

function parseMoney(v: FormDataEntryValue | null): number | null {
  if (v == null || String(v).trim() === "") return null
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null
}

function parseDate(v: FormDataEntryValue | null): Date | null {
  if (!v) return null
  const s = String(v).trim()
  if (!s) return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Assign an existing subcontractor to a project. UNIQUE on
 * (projectId, subcontractorId) means re-adding the same sub is a no-op
 * upsert — keeps the existing assignment row instead of creating a dupe.
 */
export async function addSubToProject(
  projectId: string,
  formData: FormData,
): Promise<{ ok: boolean; error?: string; assignmentId?: string }> {
  const { userId } = await requireProject(projectId)

  const subcontractorId = String(formData.get("subcontractorId") ?? "").trim()
  if (!subcontractorId) return { ok: false, error: "Pick a subcontractor" }

  // Verify the sub belongs to this user.
  const sub = await prisma.subcontractor.findFirst({
    where: { id: subcontractorId, userId },
    select: { id: true },
  })
  if (!sub) return { ok: false, error: "Subcontractor not found" }

  try {
    const existing = await prisma.projectSubcontractor.findFirst({
      where: { projectId, subcontractorId },
      select: { id: true },
    })
    if (existing) {
      return { ok: true, assignmentId: existing.id }
    }
    const assignment = await prisma.projectSubcontractor.create({
      data: {
        projectId,
        subcontractorId,
        scope: String(formData.get("scope") ?? "").trim() || null,
        agreedAmount: parseMoney(formData.get("agreedAmount")),
        hourlyRate: parseMoney(formData.get("hourlyRate")),
        startDate: parseDate(formData.get("startDate")),
        endDate: parseDate(formData.get("endDate")),
        status: parseStatus(formData.get("status")),
      },
    })
    revalidatePath(`/projects/${projectId}`)
    revalidatePath(`/subs/${subcontractorId}`)
    logInfo("addSubToProject", "Assigned sub to project", {
      projectId,
      subcontractorId,
      assignmentId: assignment.id,
    })
    return { ok: true, assignmentId: assignment.id }
  } catch (e) {
    logError("addSubToProject", e, { projectId, subcontractorId })
    return { ok: false, error: e instanceof Error ? e.message : "Could not assign" }
  }
}

export async function updateProjectSubcontractor(
  projectId: string,
  assignmentId: string,
  formData: FormData,
): Promise<void> {
  await requireProject(projectId)

  await prisma.projectSubcontractor.updateMany({
    where: { id: assignmentId, projectId },
    data: {
      scope: String(formData.get("scope") ?? "").trim() || null,
      agreedAmount: parseMoney(formData.get("agreedAmount")),
      hourlyRate: parseMoney(formData.get("hourlyRate")),
      startDate: parseDate(formData.get("startDate")),
      endDate: parseDate(formData.get("endDate")),
      status: parseStatus(formData.get("status")),
      notes: String(formData.get("notes") ?? "").trim() || null,
    },
  })
  revalidatePath(`/projects/${projectId}`)
}

export async function removeProjectSubcontractor(
  projectId: string,
  assignmentId: string,
): Promise<void> {
  await requireProject(projectId)
  // ProjectSubcontractor uses ON DELETE RESTRICT through Subcontractor, but
  // we're deleting the assignment row itself, not the sub. That's safe:
  // payments + ratings keyed off the sub stay intact, ledger preserved.
  const target = await prisma.projectSubcontractor.findFirst({
    where: { id: assignmentId, projectId },
    select: { id: true, subcontractorId: true },
  })
  if (!target) return
  await prisma.projectSubcontractor.delete({ where: { id: assignmentId } })
  revalidatePath(`/projects/${projectId}`)
  revalidatePath(`/subs/${target.subcontractorId}`)
}

/**
 * Project-scoped wrapper around the global rateSubcontractor action so we
 * can `.bind(null, projectId)` it on the project page and pass a
 * `(subId, formData)` callback to the client component.
 */
export async function rateSubOnProject(
  projectId: string,
  subcontractorId: string,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  // Defence-in-depth: confirm the project belongs to the current user
  // before delegating. rateSub will check both sides itself.
  await requireProject(projectId)
  return rateSub(subcontractorId, projectId, formData)
}

/**
 * Quick-add a brand-new sub from inside the project page. Wraps
 * createSubcontractor + addSubToProject so the contractor doesn't have to
 * go to /subs first. Same auth as both underlying actions.
 */
export async function quickCreateSubAndAssign(
  projectId: string,
  formData: FormData,
): Promise<{ ok: boolean; error?: string; subcontractorId?: string }> {
  const userId = await requireUserId()
  const name = String(formData.get("name") ?? "").trim()
  if (!name) return { ok: false, error: "Name is required" }

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
    select: { id: true },
  })
  if (!project) return { ok: false, error: "Project not found" }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const sub = await tx.subcontractor.create({
        data: {
          userId,
          name,
          phone: String(formData.get("phone") ?? "").trim() || null,
        },
      })
      const assignment = await tx.projectSubcontractor.create({
        data: {
          projectId,
          subcontractorId: sub.id,
          status: "invited",
        },
      })
      return { sub, assignment }
    })
    revalidatePath(`/projects/${projectId}`)
    revalidatePath("/subs")
    return { ok: true, subcontractorId: result.sub.id }
  } catch (e) {
    logError("quickCreateSubAndAssign", e, { projectId })
    return { ok: false, error: e instanceof Error ? e.message : "Could not create" }
  }
}
