import { prisma } from "@/lib/db"
import { ProposalPdf } from "@/lib/pdf/proposal-pdf"
import { renderToBuffer } from "@react-pdf/renderer"
import { logError, logInfo } from "@/lib/log"

export const runtime = "nodejs"
export const maxDuration = 60

const SCOPE = "/api/pdf/proposal-public"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const started = Date.now()
  const { token } = await params
  try {
  if (!token || token.length < 16) return new Response("Not found", { status: 404 })

  const project = await prisma.project.findFirst({
    where: { shareToken: token },
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
  logInfo(SCOPE, "Rendered public proposal PDF", {
    projectId: project.id,
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
    logError(SCOPE, e, { token: token?.slice(0, 8) + "...", durationMs: Date.now() - started })
    throw e
  }
}
