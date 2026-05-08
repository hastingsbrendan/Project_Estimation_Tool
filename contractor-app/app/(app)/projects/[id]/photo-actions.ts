"use server"

import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { put, del } from "@vercel/blob"
import { requireProject } from "@/lib/auth-helpers"

const MAX_BYTES = 12 * 1024 * 1024 // 12 MB per photo
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
])

export async function uploadPhoto(
  projectId: string,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  await requireProject(projectId)

  const file = formData.get("photo")
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "No photo selected" }
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, error: "Photo is larger than 12 MB" }
  }
  if (file.type && !ALLOWED_TYPES.has(file.type)) {
    return { ok: false, error: `Unsupported file type: ${file.type}` }
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return {
      ok: false,
      error:
        "Photo storage isn't enabled yet. In Vercel → Storage, create a Blob store and connect it to this project.",
    }
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_") || "photo"
  const pathname = `projects/${projectId}/${Date.now()}-${safeName}`

  let blob
  try {
    blob = await put(pathname, file, {
      access: "public",
      addRandomSuffix: false,
    })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Upload failed" }
  }

  const last = await prisma.photo.findFirst({
    where: { projectId },
    orderBy: { order: "desc" },
  })

  await prisma.photo.create({
    data: {
      projectId,
      url: blob.url,
      pathname: blob.pathname,
      filename: file.name,
      size: file.size,
      order: (last?.order ?? -1) + 1,
    },
  })
  revalidatePath(`/projects/${projectId}`)
  return { ok: true }
}

export async function deletePhoto(
  projectId: string,
  photoId: string,
): Promise<void> {
  await requireProject(projectId)
  const photo = await prisma.photo.findFirst({
    where: { id: photoId, projectId },
  })
  if (!photo) return

  // Best-effort: remove from blob storage. If it fails, still drop the DB row
  // so the user can retry without a phantom row in the UI.
  try {
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      await del(photo.url)
    }
  } catch {
    // swallow
  }

  await prisma.photo.delete({ where: { id: photoId } })
  revalidatePath(`/projects/${projectId}`)
}

export async function updatePhotoCaption(
  projectId: string,
  photoId: string,
  formData: FormData,
): Promise<void> {
  await requireProject(projectId)
  const caption = String(formData.get("caption") ?? "").trim() || null
  // Scope by projectId so a tampered form can't relabel another user's photo.
  await prisma.photo.updateMany({
    where: { id: photoId, projectId },
    data: { caption },
  })
  revalidatePath(`/projects/${projectId}`)
}
