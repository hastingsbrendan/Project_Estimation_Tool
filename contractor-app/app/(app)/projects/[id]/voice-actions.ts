"use server"

import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { requireProject, requireUserId } from "@/lib/auth-helpers"
import {
  draftEstimateFromTranscript,
  type DraftResult,
  type DraftSection,
} from "@/lib/ai/walkthrough-drafter"
import { logError, logInfo } from "@/lib/log"

// Keep the prompt bounded: the catalog can be ~300+ rows; we send the
// whole thing (it's the model's vocabulary), but cap defensively so a
// pathological catalog can't blow the context.
const MAX_CATALOG_ROWS = 600
const MAX_TRANSCRIPT_CHARS = 12_000

/**
 * Turn walkthrough notes (spoken via Web Speech or typed) into a draft
 * estimate. READ-ONLY: returns the draft for review; nothing is written
 * until the contractor applies it.
 */
export async function draftFromTranscript(
  projectId: string,
  transcript: string,
): Promise<DraftResult> {
  const started = Date.now()
  try {
    await requireProject(projectId)
    const userId = await requireUserId()
    const catalog = await prisma.catalogItem.findMany({
      where: { userId, archived: false },
      select: { id: true, description: true, unit: true, unitPrice: true, kind: true },
      orderBy: [{ kind: "asc" }, { trade: "asc" }, { description: "asc" }],
      take: MAX_CATALOG_ROWS,
    })
    const result = await draftEstimateFromTranscript(
      transcript.slice(0, MAX_TRANSCRIPT_CHARS),
      catalog,
    )
    logInfo("draftFromTranscript", "Drafted estimate from walkthrough", {
      projectId,
      transcriptChars: transcript.length,
      ok: result.ok,
      sectionCount: result.ok ? result.sections.length : 0,
      durationMs: Date.now() - started,
    })
    return result
  } catch (e) {
    logError("draftFromTranscript", e, { projectId, durationMs: Date.now() - started })
    return { ok: false, error: "Drafting failed — try again." }
  }
}

/**
 * Write an accepted draft into the project: new sections appended after
 * existing ones, items in order. catalogItemIds are re-validated against
 * the user's catalog (defense-in-depth — the client could tamper).
 */
export async function applyDraft(
  projectId: string,
  sections: DraftSection[],
): Promise<{ ok: boolean; added: number; error?: string }> {
  try {
    await requireProject(projectId)
    const userId = await requireUserId()

    const claimedIds = [
      ...new Set(
        sections
          .flatMap((s) => s.items.map((i) => i.catalogItemId))
          .filter((id): id is string => typeof id === "string"),
      ),
    ]
    const owned = claimedIds.length
      ? await prisma.catalogItem.findMany({
          where: { id: { in: claimedIds }, userId },
          select: { id: true },
        })
      : []
    const ownedIds = new Set(owned.map((c) => c.id))

    let added = 0
    await prisma.$transaction(async (tx) => {
      const last = await tx.section.findFirst({
        where: { projectId },
        orderBy: { order: "desc" },
        select: { order: true },
      })
      let order = (last?.order ?? -1) + 1

      for (const s of sections) {
        const name = s.name.trim()
        if (!name || s.items.length === 0) continue
        const section = await tx.section.create({
          data: { projectId, name, order: order++ },
        })
        await tx.lineItem.createMany({
          data: s.items.map((it, i) => ({
            sectionId: section.id,
            description: it.description.trim() || "Untitled item",
            quantity: Number.isFinite(it.quantity) && it.quantity > 0 ? it.quantity : 1,
            unit: it.unit.trim() || "ea",
            unitPrice: Number.isFinite(it.unitPrice) && it.unitPrice >= 0 ? it.unitPrice : 0,
            kind: it.kind === "labor" ? "labor" : "material",
            order: i,
            catalogItemId:
              it.catalogItemId && ownedIds.has(it.catalogItemId)
                ? it.catalogItemId
                : null,
          })),
        })
        added += s.items.length
      }
    })

    revalidatePath(`/projects/${projectId}`)
    logInfo("applyDraft", "Applied walkthrough draft", { projectId, added })
    return { ok: true, added }
  } catch (e) {
    logError("applyDraft", e, { projectId })
    return { ok: false, added: 0, error: "Couldn't apply the draft — try again." }
  }
}
