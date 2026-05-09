"use server"

import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { requireSubcontractor, requireUserId } from "@/lib/auth-helpers"
import { encrypt, last4, isPiiKeyConfigured } from "@/lib/crypto/secret-box"
import { logError, logInfo } from "@/lib/log"

const MAX_NAME = 200
const MAX_NOTES = 4000

function str(v: FormDataEntryValue | null, max = 200): string | null {
  if (v == null) return null
  const s = String(v).trim().slice(0, max)
  return s || null
}

function bool(v: FormDataEntryValue | null): boolean {
  return v === "1" || v === "on" || v === "true"
}

export async function createSubcontractor(
  formData: FormData,
): Promise<{ ok: boolean; error?: string; subcontractorId?: string }> {
  const userId = await requireUserId()

  const name = str(formData.get("name"), MAX_NAME)
  if (!name) return { ok: false, error: "Name is required" }

  try {
    const sub = await prisma.subcontractor.create({
      data: {
        userId,
        name,
        contactName: str(formData.get("contactName")),
        email: str(formData.get("email")),
        phone: str(formData.get("phone")),
        address: str(formData.get("address")),
        isCorporation: bool(formData.get("isCorporation")),
        notes: str(formData.get("notes"), MAX_NOTES),
      },
    })
    revalidatePath("/subs")
    logInfo("createSubcontractor", "Created subcontractor", {
      userId,
      subcontractorId: sub.id,
    })
    return { ok: true, subcontractorId: sub.id }
  } catch (e) {
    logError("createSubcontractor", e, { userId })
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not create subcontractor",
    }
  }
}

export async function updateSubcontractor(
  subcontractorId: string,
  formData: FormData,
): Promise<void> {
  const { userId } = await requireSubcontractor(subcontractorId)

  const name = str(formData.get("name"), MAX_NAME)

  await prisma.subcontractor.updateMany({
    where: { id: subcontractorId, userId },
    data: {
      ...(name && { name }),
      contactName: str(formData.get("contactName")),
      email: str(formData.get("email")),
      phone: str(formData.get("phone")),
      address: str(formData.get("address")),
      isCorporation: bool(formData.get("isCorporation")),
      notes: str(formData.get("notes"), MAX_NOTES),
    },
  })
  revalidatePath("/subs")
  revalidatePath(`/subs/${subcontractorId}`)
}

export async function archiveSubcontractor(subcontractorId: string): Promise<void> {
  const { userId } = await requireSubcontractor(subcontractorId)
  await prisma.subcontractor.updateMany({
    where: { id: subcontractorId, userId },
    data: { archived: true },
  })
  revalidatePath("/subs")
}

export async function unarchiveSubcontractor(subcontractorId: string): Promise<void> {
  const { userId } = await requireSubcontractor(subcontractorId)
  await prisma.subcontractor.updateMany({
    where: { id: subcontractorId, userId },
    data: { archived: false },
  })
  revalidatePath("/subs")
}

export async function deleteSubcontractor(subcontractorId: string): Promise<void> {
  const { userId } = await requireSubcontractor(subcontractorId)
  // Cascade clears specialties + ratings + payments. Project assignments
  // use ON DELETE RESTRICT so this fails if the sub is on an active
  // project — caller should archive instead in that case.
  await prisma.subcontractor.deleteMany({
    where: { id: subcontractorId, userId },
  })
  revalidatePath("/subs")
  redirect("/subs")
}

/**
 * Encrypt a tax ID (SSN or EIN) and store it. Plaintext last-4 is also
 * stored so the masked-display UI doesn't have to decrypt on every
 * render. Refuses if SUBCONTRACTOR_PII_KEY is missing.
 */
export async function setTaxId(
  subcontractorId: string,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const { userId } = await requireSubcontractor(subcontractorId)
  if (!isPiiKeyConfigured()) {
    return {
      ok: false,
      error:
        "Encryption key not configured. Set SUBCONTRACTOR_PII_KEY in Vercel env vars.",
    }
  }

  const raw = String(formData.get("taxId") ?? "").trim()
  const digits = raw.replace(/\D/g, "")
  if (digits.length !== 9) {
    return { ok: false, error: "Tax ID must be 9 digits (SSN or EIN)." }
  }

  try {
    const ciphertext = encrypt(digits)
    await prisma.subcontractor.updateMany({
      where: { id: subcontractorId, userId },
      data: {
        taxIdEncrypted: ciphertext,
        taxIdLast4: last4(digits),
      },
    })
    revalidatePath(`/subs/${subcontractorId}`)
    return { ok: true }
  } catch (e) {
    logError("setTaxId", e, { subcontractorId })
    return { ok: false, error: e instanceof Error ? e.message : "Could not save" }
  }
}

export async function unsetTaxId(subcontractorId: string): Promise<void> {
  const { userId } = await requireSubcontractor(subcontractorId)
  await prisma.subcontractor.updateMany({
    where: { id: subcontractorId, userId },
    data: { taxIdEncrypted: null, taxIdLast4: null },
  })
  revalidatePath(`/subs/${subcontractorId}`)
}

export async function addSpecialty(
  subcontractorId: string,
  formData: FormData,
): Promise<void> {
  const { userId } = await requireSubcontractor(subcontractorId)
  const specialtyId = String(formData.get("specialtyId") ?? "").trim()
  if (!specialtyId) return

  // Verify the specialty is either a default OR owned by this user.
  const spec = await prisma.specialty.findFirst({
    where: {
      id: specialtyId,
      OR: [{ isDefault: true }, { userId }],
    },
  })
  if (!spec) return

  // Idempotent — UNIQUE on (subcontractorId, specialtyId) means a duplicate
  // INSERT throws; catch it and treat as success.
  try {
    await prisma.subcontractorSpecialty.create({
      data: { subcontractorId, specialtyId },
    })
  } catch {
    // already linked
  }
  revalidatePath(`/subs/${subcontractorId}`)
}

export async function removeSpecialty(
  subcontractorId: string,
  specialtyId: string,
): Promise<void> {
  const { userId } = await requireSubcontractor(subcontractorId)
  // Ownership double-check via the join — deleteMany is safe here because
  // the where pins on the user-owned subcontractor.
  void userId
  await prisma.subcontractorSpecialty.deleteMany({
    where: { subcontractorId, specialtyId },
  })
  revalidatePath(`/subs/${subcontractorId}`)
}
