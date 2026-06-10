"use server"

import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { put, del } from "@vercel/blob"
import { requireUserId } from "@/lib/auth-helpers"
import { logError } from "@/lib/log"

const LOGO_MAX_BYTES = 4 * 1024 * 1024 // 4 MB is plenty for a logo
const LOGO_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/svg+xml"])

function str(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim()
  return s || null
}

export async function updateBusinessProfile(formData: FormData): Promise<void> {
  const userId = await requireUserId()
  try {
    const data = {
      businessName: str(formData.get("businessName")),
      tagline: str(formData.get("tagline")),
      licenseNumber: str(formData.get("licenseNumber")),
      phone: str(formData.get("phone")),
      email: str(formData.get("email")),
      address: str(formData.get("address")),
    }
    await prisma.businessProfile.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    })
  } catch (e) {
    logError("updateBusinessProfile", e, { userId })
    throw e
  }
  revalidatePath("/settings")
}

export async function uploadLogo(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const userId = await requireUserId()

  const file = formData.get("logo")
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "No file selected" }
  }
  if (file.size > LOGO_MAX_BYTES) {
    return { ok: false, error: "Logo is larger than 4 MB" }
  }
  if (file.type && !LOGO_TYPES.has(file.type)) {
    return { ok: false, error: `Unsupported file type: ${file.type}` }
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return {
      ok: false,
      error:
        "File storage isn't enabled. In Vercel → Storage, create a Blob store and connect it to this project.",
    }
  }

  try {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_") || "logo"
    const blob = await put(`branding/${userId}/${Date.now()}-${safeName}`, file, {
      access: "public",
      addRandomSuffix: false,
    })

    // Replace, don't accumulate: delete the previous blob if any.
    const existing = await prisma.businessProfile.findUnique({ where: { userId } })
    if (existing?.logoPathname) {
      await del(existing.logoPathname).catch(() => {
        // best-effort cleanup; an orphan blob is harmless
      })
    }
    await prisma.businessProfile.upsert({
      where: { userId },
      create: { userId, logoUrl: blob.url, logoPathname: blob.pathname },
      update: { logoUrl: blob.url, logoPathname: blob.pathname },
    })
  } catch (e) {
    logError("uploadLogo", e, { userId })
    return { ok: false, error: e instanceof Error ? e.message : "Upload failed" }
  }
  revalidatePath("/settings")
  return { ok: true }
}

export async function removeLogo(): Promise<void> {
  const userId = await requireUserId()
  try {
    const existing = await prisma.businessProfile.findUnique({ where: { userId } })
    if (existing?.logoPathname) {
      await del(existing.logoPathname).catch(() => {})
    }
    if (existing) {
      await prisma.businessProfile.update({
        where: { userId },
        data: { logoUrl: null, logoPathname: null },
      })
    }
  } catch (e) {
    logError("removeLogo", e, { userId })
    throw e
  }
  revalidatePath("/settings")
}
