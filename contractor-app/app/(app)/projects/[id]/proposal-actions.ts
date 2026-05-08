"use server"

import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { ProposalPdf } from "@/lib/pdf/proposal-pdf"
import { renderToBuffer } from "@react-pdf/renderer"
import { calcEstimate, formatCurrency } from "@/lib/calc"

async function requireProject(projectId: string) {
  const session = await auth()
  if (!session?.user?.email) throw new Error("Unauthorized")
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) throw new Error("User not found")
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: user.id },
    include: {
      sections: {
        include: { lineItems: { orderBy: { order: "asc" } } },
        orderBy: { order: "asc" },
      },
    },
  })
  if (!project) throw new Error("Project not found")
  return { project, user }
}

export async function sendProposalEmail(
  projectId: string,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const { project } = await requireProject(projectId)

  const overrideEmail = String(formData.get("toEmail") ?? "").trim()
  const recipient = overrideEmail || project.clientEmail
  if (!recipient) return { ok: false, error: "Add a client email first" }

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return {
      ok: false,
      error: "Email isn't configured. Set RESEND_API_KEY in Vercel env vars.",
    }
  }
  const fromAddress = process.env.EMAIL_FROM ?? "onboarding@resend.dev"

  // Render the PDF to a Buffer, then base64 for the Resend attachment payload.
  const pdfBuffer = await renderToBuffer(
    ProposalPdf({
      project: {
        name: project.name,
        clientName: project.clientName,
        clientEmail: project.clientEmail,
        address: project.address,
        scope: project.scope,
        exclusions: project.exclusions,
        paymentSchedule: project.paymentSchedule,
        markupPct: project.markupPct,
        taxRate: project.taxRate,
        acceptedAt: project.acceptedAt,
        acceptedBy: project.acceptedBy,
      },
      sections: project.sections.map((s) => ({
        name: s.name,
        lineItems: s.lineItems.map((li) => ({
          description: li.description,
          quantity: li.quantity,
          unit: li.unit,
          unitPrice: li.unitPrice,
          kind: li.kind,
        })),
      })),
      generatedAt: new Date(),
    }),
  )

  const attachmentBase64 = Buffer.from(pdfBuffer).toString("base64")
  const safeName =
    project.name.replace(/[^a-zA-Z0-9._-]/g, "_") || "project"
  const filename = `${safeName}-proposal.pdf`

  const allLineItems = project.sections.flatMap((s) =>
    s.lineItems.map((li) => ({
      quantity: li.quantity,
      unitPrice: li.unitPrice,
      kind: li.kind as "material" | "labor",
    })),
  )
  const totals = calcEstimate({
    lineItems: allLineItems,
    markupPct: project.markupPct,
    taxRate: project.taxRate,
  })

  const customMessage = String(formData.get("message") ?? "").trim()
  const brandName = "Reliable Remodeling"
  const html = `<!DOCTYPE html><html><body style="font-family: system-ui, -apple-system, sans-serif; padding: 32px; background: #faf9f6; color: #18181b;">
  <div style="max-width: 560px; margin: 0 auto; background: white; padding: 32px; border-radius: 8px; border: 1px solid #e7e5e0;">
    <p style="margin: 0 0 24px; font-size: 11px; letter-spacing: 2px; color: #18181b; font-weight: 700;">${brandName.toUpperCase()}</p>
    <h1 style="margin: 0 0 8px; font-size: 20px;">Proposal — ${escapeHtml(project.name)}</h1>
    <p style="color: #52525b; margin: 0 0 24px;">${escapeHtml(
      project.clientName ?? "Hi there",
    )},</p>
    ${
      customMessage
        ? `<p style="line-height: 1.5; margin: 0 0 24px;">${escapeHtml(customMessage).replace(/\n/g, "<br>")}</p>`
        : `<p style="line-height: 1.5; margin: 0 0 24px;">Attached is the proposal for <strong>${escapeHtml(project.name)}</strong>. The total comes to <strong>${formatCurrency(totals.total)}</strong>. Let me know if you have any questions or would like to discuss any line items.</p>`
    }
    <p style="line-height: 1.5; margin: 0 0 8px;"><strong>Total:</strong> ${formatCurrency(totals.total)}</p>
    <p style="line-height: 1.5; margin: 0 0 24px; color: #52525b; font-size: 13px;">Full breakdown is in the attached PDF.</p>
    <p style="color: #71717a; font-size: 12px; margin: 24px 0 0;">Thanks,<br>${brandName}</p>
  </div>
</body></html>`

  const text = `${customMessage || `Attached is the proposal for ${project.name}. Total: ${formatCurrency(totals.total)}.`}\n\nFull breakdown is in the attached PDF.`

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromAddress,
      to: [recipient],
      subject: `Proposal — ${project.name}`,
      html,
      text,
      attachments: [
        {
          filename,
          content: attachmentBase64,
        },
      ],
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    return { ok: false, error: `Resend send failed (${res.status}): ${body}` }
  }

  await prisma.project.update({
    where: { id: projectId },
    data: {
      proposalSentAt: new Date(),
      ...(project.status === "draft" ? { status: "sent" } : {}),
    },
  })
  revalidatePath(`/projects/${projectId}`)
  revalidatePath(`/projects/${projectId}/proposal`)
  revalidatePath("/projects")
  return { ok: true }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}
