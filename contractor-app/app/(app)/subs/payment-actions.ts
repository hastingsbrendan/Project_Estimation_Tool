"use server"

import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { requireSubcontractor, requireUserId } from "@/lib/auth-helpers"
import { logError, logInfo } from "@/lib/log"

const ALLOWED_METHODS = new Set(["check", "ach", "cash", "other"])

function parseMoney(v: FormDataEntryValue | null): number {
  const n = Number(v ?? 0)
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0
}

function parseMethod(v: FormDataEntryValue | null): string {
  const s = String(v ?? "check").toLowerCase()
  return ALLOWED_METHODS.has(s) ? s : "check"
}

export async function addPayment(
  subcontractorId: string,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const { userId } = await requireSubcontractor(subcontractorId)

  const amount = parseMoney(formData.get("amount"))
  if (amount <= 0) return { ok: false, error: "Amount must be positive" }

  const paidAtRaw = String(formData.get("paidAt") ?? "").trim()
  const paidAt = paidAtRaw ? new Date(paidAtRaw) : new Date()
  if (Number.isNaN(paidAt.getTime())) {
    return { ok: false, error: "Invalid paid-at date" }
  }

  // Optional projectId — if present, must belong to the same user.
  const projectIdRaw = String(formData.get("projectId") ?? "").trim()
  let projectId: string | null = null
  if (projectIdRaw) {
    const project = await prisma.project.findFirst({
      where: { id: projectIdRaw, userId },
      select: { id: true },
    })
    if (!project) return { ok: false, error: "Project not found" }
    projectId = project.id
  }

  try {
    const payment = await prisma.subcontractorPayment.create({
      data: {
        subcontractorId,
        projectId,
        amount,
        paidAt,
        method: parseMethod(formData.get("method")),
        reference: String(formData.get("reference") ?? "").trim() || null,
        notes: String(formData.get("notes") ?? "").trim() || null,
      },
    })
    logInfo("addPayment", "Logged payment", {
      subcontractorId,
      paymentId: payment.id,
      amount,
      projectId,
    })
    revalidatePath(`/subs/${subcontractorId}`)
    if (projectId) revalidatePath(`/projects/${projectId}`)
    return { ok: true }
  } catch (e) {
    logError("addPayment", e, { subcontractorId })
    return { ok: false, error: e instanceof Error ? e.message : "Could not save payment" }
  }
}

export async function updatePayment(
  paymentId: string,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const userId = await requireUserId()
  // Scope through the parent subcontractor's userId.
  const payment = await prisma.subcontractorPayment.findFirst({
    where: { id: paymentId, subcontractor: { userId } },
    include: { subcontractor: { select: { id: true } } },
  })
  if (!payment) return { ok: false, error: "Payment not found" }

  const amount = parseMoney(formData.get("amount"))
  if (amount <= 0) return { ok: false, error: "Amount must be positive" }

  const paidAtRaw = String(formData.get("paidAt") ?? "").trim()
  const paidAt = paidAtRaw ? new Date(paidAtRaw) : payment.paidAt

  await prisma.subcontractorPayment.update({
    where: { id: paymentId },
    data: {
      amount,
      paidAt,
      method: parseMethod(formData.get("method")),
      reference: String(formData.get("reference") ?? "").trim() || null,
      notes: String(formData.get("notes") ?? "").trim() || null,
    },
  })
  revalidatePath(`/subs/${payment.subcontractor.id}`)
  return { ok: true }
}

export async function deletePayment(paymentId: string): Promise<void> {
  const userId = await requireUserId()
  const payment = await prisma.subcontractorPayment.findFirst({
    where: { id: paymentId, subcontractor: { userId } },
    include: { subcontractor: { select: { id: true } } },
  })
  if (!payment) return
  await prisma.subcontractorPayment.delete({ where: { id: paymentId } })
  revalidatePath(`/subs/${payment.subcontractor.id}`)
}
