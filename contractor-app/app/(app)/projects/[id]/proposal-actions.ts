"use server"

import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { ProposalPdf } from "@/lib/pdf/proposal-pdf"
import { renderToBuffer } from "@react-pdf/renderer"
import { calcEstimate, formatCurrency } from "@/lib/calc"
import { requireProject as requireProjectBase } from "@/lib/auth-helpers"
import { logError, logInfo } from "@/lib/log"

/**
 * Local extension of `requireProject` that also fetches the sections + line
 * items needed for proposal PDF rendering. Wraps the shared helper so the
 * auth/ownership check stays in one place.
 */
async function requireProject(projectId: string) {
  const { userId } = await requireProjectBase(projectId)
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
    include: {
      sections: {
        include: { lineItems: { orderBy: { order: "asc" } } },
        orderBy: { order: "asc" },
      },
    },
  })
  if (!project) throw new Error("Project not found")
  return { project, userId }
}

export async function sendProposalEmail(
  projectId: string,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const { project, userId } = await requireProject(projectId)

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

  // CC the contractor on real sends so they always have a copy. Skipped
  // on test-sends (form sets cc=0) because the test goes to the contractor
  // anyway — CCing themselves on top would just duplicate.
  const wantsCc = String(formData.get("cc") ?? "0") === "1"
  let ccAddress: string | null = null
  if (wantsCc) {
    const contractor = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    })
    if (contractor?.email && contractor.email.toLowerCase() !== recipient.toLowerCase()) {
      ccAddress = contractor.email
    }
  }

  // Make sure a public share token exists so the email's "Review and sign
  // online" button has somewhere to point. If the contractor never clicked
  // "Generate share link", spin one up automatically — it's cheap and the
  // alternative is sending a PDF with no path to signing.
  let shareToken = project.shareToken
  if (!shareToken) {
    shareToken = crypto.randomUUID().replace(/-/g, "")
    await prisma.project.update({
      where: { id: project.id },
      data: { shareToken },
    })
  }
  const origin =
    process.env.AUTH_URL ??
    process.env.NEXTAUTH_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
  const shareUrl = origin ? `${origin}/proposal/${shareToken}` : null

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
  const ctaButton = shareUrl
    ? `<p style="margin: 24px 0;"><a href="${shareUrl}" style="display: inline-block; background: #18181b; color: #ffffff; padding: 12px 20px; border-radius: 6px; text-decoration: none; font-weight: 600;">Review and sign online</a></p>
    <p style="line-height: 1.5; margin: 0 0 8px; font-size: 13px; color: #71717a;">No login required — opens directly in your browser.</p>`
    : ""
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
    <p style="line-height: 1.5; margin: 0 0 24px; color: #52525b; font-size: 13px;">Full breakdown is in the attached PDF${shareUrl ? " or the link below" : ""}.</p>
    ${ctaButton}
    <p style="color: #71717a; font-size: 12px; margin: 24px 0 0;">Thanks,<br>${brandName}</p>
  </div>
</body></html>`

  const text = `${customMessage || `Attached is the proposal for ${project.name}. Total: ${formatCurrency(totals.total)}.`}\n\nFull breakdown is in the attached PDF.${shareUrl ? `\n\nReview and sign online (no login required):\n${shareUrl}` : ""}`

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromAddress,
      to: [recipient],
      ...(ccAddress ? { cc: [ccAddress] } : {}),
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
    logError("sendProposalEmail", new Error(`Resend ${res.status}`), {
      projectId,
      recipient,
      status: res.status,
      bodySnippet: body.slice(0, 200),
    })
    return { ok: false, error: `Resend send failed (${res.status}): ${body}` }
  }

  logInfo("sendProposalEmail", "Sent proposal email", {
    projectId,
    recipient,
    cc: ccAddress,
    pdfBytes: pdfBuffer.byteLength,
    hasShareLink: !!shareUrl,
  })

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
