"use server"

import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { requireUserId } from "@/lib/auth-helpers"

function clampStars(v: FormDataEntryValue | null): number {
  const n = Number(v ?? 0)
  if (!Number.isFinite(n)) return 0
  return Math.max(1, Math.min(5, Math.round(n)))
}

/**
 * Upsert a rating (one per project per sub). Re-rating the same pair
 * overwrites the previous score — that's fine, the contractor's reflection
 * may shift after invoicing closes out.
 */
export async function rateSubcontractor(
  subcontractorId: string,
  projectId: string,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const userId = await requireUserId()

  // Verify both the sub and the project belong to this user.
  const [sub, project] = await Promise.all([
    prisma.subcontractor.findFirst({
      where: { id: subcontractorId, userId },
      select: { id: true },
    }),
    prisma.project.findFirst({
      where: { id: projectId, userId },
      select: { id: true },
    }),
  ])
  if (!sub || !project) return { ok: false, error: "Subcontractor or project not found" }

  const quality = clampStars(formData.get("qualityStars"))
  const timeliness = clampStars(formData.get("timelinessStars"))
  const communication = clampStars(formData.get("communicationStars"))
  const overall = clampStars(formData.get("overallStars"))

  if ([quality, timeliness, communication, overall].some((s) => s < 1)) {
    return { ok: false, error: "Rate all four dimensions 1-5" }
  }

  await prisma.subcontractorRating.upsert({
    where: {
      projectId_subcontractorId: { projectId, subcontractorId },
    },
    create: {
      subcontractorId,
      projectId,
      qualityStars: quality,
      timelinessStars: timeliness,
      communicationStars: communication,
      overallStars: overall,
      notes: String(formData.get("notes") ?? "").trim() || null,
    },
    update: {
      qualityStars: quality,
      timelinessStars: timeliness,
      communicationStars: communication,
      overallStars: overall,
      notes: String(formData.get("notes") ?? "").trim() || null,
    },
  })
  revalidatePath(`/subs/${subcontractorId}`)
  revalidatePath(`/projects/${projectId}`)
  return { ok: true }
}

export async function deleteRating(
  subcontractorId: string,
  projectId: string,
): Promise<void> {
  const userId = await requireUserId()
  // Both ownership-check + delete in one query.
  await prisma.subcontractorRating.deleteMany({
    where: {
      subcontractorId,
      projectId,
      subcontractor: { userId },
    },
  })
  revalidatePath(`/subs/${subcontractorId}`)
  revalidatePath(`/projects/${projectId}`)
}
