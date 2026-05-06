"use server"

import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

async function requireUserId(): Promise<string> {
  const session = await auth()
  if (!session?.user?.email) throw new Error("Unauthorized")
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) throw new Error("User not found")
  return user.id
}

export async function createProject(formData: FormData): Promise<void> {
  const userId = await requireUserId()

  const name = String(formData.get("name") ?? "").trim()
  if (!name) throw new Error("Project name is required")

  const clientName = String(formData.get("clientName") ?? "").trim() || null
  const clientEmail = String(formData.get("clientEmail") ?? "").trim() || null
  const address = String(formData.get("address") ?? "").trim() || null

  const project = await prisma.project.create({
    data: {
      name,
      clientName,
      clientEmail,
      address,
      userId,
    },
  })

  revalidatePath("/projects")
  redirect(`/projects/${project.id}`)
}

export async function deleteProject(projectId: string): Promise<void> {
  const userId = await requireUserId()

  // Confirm ownership before delete
  const project = await prisma.project.findFirst({ where: { id: projectId, userId } })
  if (!project) throw new Error("Project not found")

  await prisma.project.delete({ where: { id: projectId } })

  revalidatePath("/projects")
  redirect("/projects")
}

export async function updateProjectSettings(
  projectId: string,
  formData: FormData,
): Promise<void> {
  const userId = await requireUserId()

  const project = await prisma.project.findFirst({ where: { id: projectId, userId } })
  if (!project) throw new Error("Project not found")

  const markupPct = Number(formData.get("markupPct") ?? 0)
  const taxRate = Number(formData.get("taxRate") ?? 0)

  await prisma.project.update({
    where: { id: projectId },
    data: {
      markupPct: Number.isFinite(markupPct) ? markupPct : 0,
      taxRate: Number.isFinite(taxRate) ? taxRate : 0,
    },
  })

  revalidatePath(`/projects/${projectId}`)
}
