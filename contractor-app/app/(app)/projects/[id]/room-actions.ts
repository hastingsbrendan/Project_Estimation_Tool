"use server"

import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { requireProject } from "@/lib/auth-helpers"

function parseFloatOrNull(v: FormDataEntryValue | null): number | null {
  if (v === null) return null
  const s = String(v).trim()
  if (s === "") return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

export async function addRoom(projectId: string, formData: FormData): Promise<void> {
  await requireProject(projectId)
  const name = String(formData.get("name") ?? "").trim() || "New room"
  const last = await prisma.room.findFirst({
    where: { projectId },
    orderBy: { order: "desc" },
  })
  await prisma.room.create({
    data: { name, projectId, order: (last?.order ?? -1) + 1 },
  })
  revalidatePath(`/projects/${projectId}`)
}

export async function updateRoom(
  projectId: string,
  roomId: string,
  formData: FormData,
): Promise<void> {
  await requireProject(projectId)
  const name = String(formData.get("name") ?? "").trim()
  const lengthFt = parseFloatOrNull(formData.get("lengthFt"))
  const widthFt = parseFloatOrNull(formData.get("widthFt"))
  const heightFt = parseFloatOrNull(formData.get("heightFt")) ?? 8
  const notes = String(formData.get("notes") ?? "").trim() || null

  // Scope on projectId so we never mutate another user's room.
  await prisma.room.updateMany({
    where: { id: roomId, projectId },
    data: {
      ...(name && { name }),
      lengthFt,
      widthFt,
      heightFt,
      notes,
    },
  })
  revalidatePath(`/projects/${projectId}`)
}

export async function deleteRoom(projectId: string, roomId: string): Promise<void> {
  await requireProject(projectId)
  await prisma.room.deleteMany({ where: { id: roomId, projectId } })
  revalidatePath(`/projects/${projectId}`)
}
