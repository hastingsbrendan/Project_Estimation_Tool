"use server"

import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { headers } from "next/headers"
import { logError, logInfo } from "@/lib/log"

const MIN_TOKEN_LEN = 16
const MAX_NAME_LEN = 200

/**
 * Public, no-auth proposal acceptance. Looks up the project by shareToken
 * (anyone with the link can sign), captures the typed name + timestamp +
 * client IP/UA for audit, and auto-flips project status to "accepted".
 *
 * Idempotent: if the proposal was already signed, returns that state and
 * does not overwrite the original signer (re-signing is intentionally
 * blocked — the contractor can void from the in-app proposal page).
 */
export async function acceptProposal(
  token: string,
  formData: FormData,
): Promise<{ ok: boolean; error?: string; alreadySigned?: boolean }> {
  try {
  if (!token || token.length < MIN_TOKEN_LEN) {
    return { ok: false, error: "Invalid link" }
  }

  const name = String(formData.get("name") ?? "").trim()
  if (!name) return { ok: false, error: "Please type your name to sign" }
  if (name.length > MAX_NAME_LEN) {
    return { ok: false, error: "Name is too long" }
  }
  const consent = formData.get("consent")
  if (!consent) return { ok: false, error: "You must check the consent box to accept" }

  const project = await prisma.project.findFirst({
    where: { shareToken: token },
    select: {
      id: true,
      status: true,
      acceptedAt: true,
      acceptedBy: true,
      proposalSentAt: true,
      createdAt: true,
      validForDays: true,
    },
  })
  if (!project) return { ok: false, error: "Proposal not found" }

  if (project.acceptedAt) {
    // Idempotent: don't overwrite the first signature.
    return { ok: true, alreadySigned: true }
  }

  // Server-side expiry check. The page also hides the form when expired,
  // but a stale tab could still POST — refuse here too.
  const proposalDate = project.proposalSentAt ?? project.createdAt
  const validForDays = project.validForDays ?? 30
  const validUntil = new Date(proposalDate.getTime() + validForDays * 86400_000)
  if (validUntil.getTime() < Date.now()) {
    return {
      ok: false,
      error:
        "This proposal has expired. Please ask the contractor to reissue an updated quote.",
    }
  }

  const h = await headers()
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null
  const userAgent = h.get("user-agent") ?? null

  await prisma.project.update({
    where: { id: project.id },
    data: {
      acceptedAt: new Date(),
      acceptedBy: name,
      acceptedIp: ip,
      acceptedUserAgent: userAgent,
      // Auto-flip to accepted unless the contractor already moved it past
      // that (won/lost/rejected wouldn't be auto-flipped — leave alone).
      ...(project.status === "draft" || project.status === "sent"
        ? { status: "accepted" }
        : {}),
    },
  })

  revalidatePath(`/proposal/${token}`)
  revalidatePath(`/projects/${project.id}/proposal`)
  revalidatePath("/projects")
  logInfo("acceptProposal", "Proposal signed", {
    projectId: project.id,
    signerName: name,
    ip,
  })
  return { ok: true }
  } catch (e) {
    logError("acceptProposal", e, { tokenPrefix: token?.slice(0, 8) + "..." })
    return {
      ok: false,
      error:
        e instanceof Error ? e.message : "Could not record acceptance — please try again",
    }
  }
}
