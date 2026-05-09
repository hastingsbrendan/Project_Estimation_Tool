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

// ─────────────────────────────────────────────────────────────────────────
// Per-line-item service assignments (W3.5)
// Different altitude than ProjectSubcontractor: this is the granular
// "who's doing this row" relationship that drives the inline checklist on
// the project detail page. Independent of the project-level engagement —
// assigning a sub here does NOT auto-create a ProjectSubcontractor row.

/**
 * Verify the line item belongs to a project the current user owns AND
 * the subcontractor (if provided) belongs to the same user. Returns the
 * userId for downstream use, throws if anything is off.
 */
async function requireLineItemAndOptionalSub(
  projectId: string,
  lineItemId: string,
  subcontractorId?: string,
): Promise<{ userId: string }> {
  const { userId } = await requireProject(projectId)
  // Scope through Section so we know the line item is *this* project's.
  const lineItem = await prisma.lineItem.findFirst({
    where: { id: lineItemId, section: { projectId } },
    select: { id: true },
  })
  if (!lineItem) throw new Error("Line item not found")
  if (subcontractorId) {
    const sub = await prisma.subcontractor.findFirst({
      where: { id: subcontractorId, userId },
      select: { id: true },
    })
    if (!sub) throw new Error("Subcontractor not found")
  }
  return { userId }
}

export async function assignSubToService(
  projectId: string,
  lineItemId: string,
  subcontractorId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireLineItemAndOptionalSub(projectId, lineItemId, subcontractorId)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Forbidden" }
  }
  try {
    // Idempotent: composite primary key means a duplicate INSERT throws.
    // upsert with empty update body is the cleanest "ensure exists" pattern.
    await prisma.lineItemSubcontractor.upsert({
      where: {
        lineItemId_subcontractorId: { lineItemId, subcontractorId },
      },
      create: { lineItemId, subcontractorId },
      update: {},
    })
    revalidatePath(`/projects/${projectId}`)
    logInfo("assignSubToService", "Assigned sub to service", {
      projectId,
      lineItemId,
      subcontractorId,
    })
    return { ok: true }
  } catch (e) {
    logError("assignSubToService", e, { projectId, lineItemId, subcontractorId })
    return { ok: false, error: e instanceof Error ? e.message : "Could not assign" }
  }
}

export async function unassignSubFromService(
  projectId: string,
  lineItemId: string,
  subcontractorId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireLineItemAndOptionalSub(projectId, lineItemId, subcontractorId)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Forbidden" }
  }
  await prisma.lineItemSubcontractor.deleteMany({
    where: { lineItemId, subcontractorId },
  })
  revalidatePath(`/projects/${projectId}`)
  return { ok: true }
}

/**
 * Flip the line item's completedAt between null and now(). Caller passes
 * `done` so we don't have to fetch the row first to decide which way to
 * flip — defensive against double-clicks.
 */
export async function toggleServiceComplete(
  projectId: string,
  lineItemId: string,
  done: boolean,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireLineItemAndOptionalSub(projectId, lineItemId)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Forbidden" }
  }
  await prisma.lineItem.updateMany({
    where: { id: lineItemId, section: { projectId } },
    data: { completedAt: done ? new Date() : null },
  })
  revalidatePath(`/projects/${projectId}`)
  logInfo("toggleServiceComplete", "Toggled service completion", {
    projectId,
    lineItemId,
    done,
  })
  return { ok: true }
}
