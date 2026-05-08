import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { ProposalPdf } from "@/lib/pdf/proposal-pdf"
import { renderToBuffer } from "@react-pdf/renderer"
import { logError, logInfo } from "@/lib/log"

export const runtime = "nodejs"
// React PDF renders a multi-page document; on Vercel a real proposal can
// take 5–15 s. Default 10 s timeout was killing it cold.
export const maxDuration = 60

const SCOPE = "/api/pdf/proposal"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const started = Date.now()
  const { id } = await params
  try {
    const session = await auth()
    if (!session?.user?.email) return new Response("Unauthorized", { status: 401 })
    const user = await prisma.user.findUnique({ where: { email: session.user.email } })
    if (!user) return new Response("Unauthorized", { status: 401 })

    const project = await prisma.project.findFirst({
      where: { id, userId: user.id },
      include: {
        sections: {
          include: { lineItems: { orderBy: { order: "asc" } } },
          orderBy: { order: "asc" },
        },
      },
    })
    if (!project) return new Response("Not found", { status: 404 })

    const buffer = await renderToBuffer(
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

    const safeName = project.name.replace(/[^a-zA-Z0-9._-]/g, "_") || "project"
    logInfo(SCOPE, "Rendered proposal PDF", {
      projectId: id,
      userId: user.id,
      sectionCount: project.sections.length,
      lineItemCount: project.sections.reduce((s, sec) => s + sec.lineItems.length, 0),
      bufferBytes: buffer.byteLength,
      durationMs: Date.now() - started,
    })
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${safeName}-proposal.pdf"`,
        "Cache-Control": "private, no-store",
      },
    })
  } catch (e) {
    logError(SCOPE, e, { projectId: id, durationMs: Date.now() - started })
    throw e
  }
}
