"use server"

import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"

async function requireProject(projectId: string) {
  const session = await auth()
  if (!session?.user?.email) throw new Error("Unauthorized")
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) throw new Error("User not found")
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: user.id },
  })
  if (!project) throw new Error("Project not found")
  return project
}

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

  await prisma.room.update({
    where: { id: roomId },
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
  await prisma.room.delete({ where: { id: roomId } })
  revalidatePath(`/projects/${projectId}`)
}
