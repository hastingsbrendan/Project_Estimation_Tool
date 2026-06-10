import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { calcEstimate } from "@/lib/calc"
import { InvoicePdf } from "@/lib/pdf/invoice-pdf"
import { renderToBuffer } from "@react-pdf/renderer"
import { logError, logInfo } from "@/lib/log"

export const runtime = "nodejs"
export const maxDuration = 60

const SCOPE = "/api/pdf/invoice"

/**
 * Render an invoice PDF for one payment milestone. Also stamps
 * `invoicedAt` on first generation — pragmatic side effect on GET so
 * the milestone row reflects "an invoice exists" without a separate
 * action round-trip.
 *
 * Invoice number: INV-<last 6 of project id>-<milestone order + 1>.
 * Stable across re-downloads, human-readable enough for a check memo.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ milestoneId: string }> },
) {
  const started = Date.now()
  const { milestoneId } = await params
  try {
    const session = await auth()
    if (!session?.user?.email) {
      return new Response("Unauthorized", { status: 401 })
    }
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    })
    if (!user) return new Response("Unauthorized", { status: 401 })

    const milestone = await prisma.milestone.findFirst({
      where: { id: milestoneId, project: { userId: user.id } },
      include: {
        project: {
          include: {
            sections: { include: { lineItems: true } },
            milestones: { orderBy: { order: "asc" } },
          },
        },
      },
    })
    if (!milestone) return new Response("Not found", { status: 404 })

    const project = milestone.project
    const lineItems = project.sections.flatMap((s) =>
      s.lineItems.map((li) => ({
        quantity: li.quantity,
        unitPrice: li.unitPrice,
        kind: li.kind as "material" | "labor",
      })),
    )
    const projectTotal = calcEstimate({
      lineItems,
      markupPct: project.markupPct,
      taxRate: project.taxRate,
    }).total

    const invoiceNumber = `INV-${project.id.slice(-6).toUpperCase()}-${milestone.order + 1}`

    const buffer = await renderToBuffer(
      InvoicePdf({
        invoiceNumber,
        projectName: project.name,
        clientName: project.clientName,
        address: project.address,
        milestoneLabel: milestone.label,
        amount: milestone.amount,
        issuedAt: milestone.invoicedAt ?? new Date(),
        projectTotal,
        schedule: project.milestones.map((m) => ({
          label: m.label,
          amount: m.amount,
          paid: m.paidAt != null,
          current: m.id === milestone.id,
        })),
      }),
    )

    if (!milestone.invoicedAt) {
      await prisma.milestone.update({
        where: { id: milestone.id },
        data: { invoicedAt: new Date() },
      })
    }

    logInfo(SCOPE, "Rendered invoice", {
      milestoneId,
      projectId: project.id,
      invoiceNumber,
      durationMs: Date.now() - started,
    })

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${invoiceNumber}.pdf"`,
      },
    })
  } catch (e) {
    logError(SCOPE, e, { milestoneId, durationMs: Date.now() - started })
    return new Response("Failed to render invoice", { status: 500 })
  }
}
