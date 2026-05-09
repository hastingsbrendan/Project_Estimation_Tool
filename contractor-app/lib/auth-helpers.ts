import { auth } from "@/auth"
import { prisma } from "@/lib/db"

/**
 * Resolve the current signed-in user's id, or throw if there's no session.
 * Throws are appropriate here: an unauthenticated server action invocation
 * is either a stale session or a deliberate probe — there is no UI flow
 * where the user can recover from "Unauthorized" inline. Next renders the
 * route's error boundary.
 */
export async function requireUserId(): Promise<string> {
  const session = await auth()
  if (!session?.user?.email) throw new Error("Unauthorized")
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) throw new Error("User not found")
  return user.id
}

/**
 * Resolve the current user *and* a project they own. Centralises the
 * ownership scoping that used to be copy-pasted across every action file.
 */
export async function requireProject(projectId: string) {
  const userId = await requireUserId()
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
  })
  if (!project) throw new Error("Project not found")
  return { project, userId }
}

/**
 * Resolve a receipt the current user owns. Receipts can be unassigned
 * (no projectId) so we scope on the receipt's own userId column.
 */
export async function requireReceipt(receiptId: string) {
  const userId = await requireUserId()
  const receipt = await prisma.receipt.findFirst({
    where: { id: receiptId, userId },
  })
  if (!receipt) throw new Error("Receipt not found")
  return { receipt, userId }
}

/**
 * Resolve a subcontractor the current user owns. Same shape as
 * requireProject / requireReceipt. Tax-id ciphertext is included in the
 * returned row — caller decides whether to call decrypt() on it.
 */
export async function requireSubcontractor(subcontractorId: string) {
  const userId = await requireUserId()
  const subcontractor = await prisma.subcontractor.findFirst({
    where: { id: subcontractorId, userId },
  })
  if (!subcontractor) throw new Error("Subcontractor not found")
  return { subcontractor, userId }
}
