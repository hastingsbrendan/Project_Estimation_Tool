import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { ProposalPdf } from "@/lib/pdf/proposal-pdf"
import { renderToBuffer } from "@react-pdf/renderer"

export const runtime = "nodejs"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
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
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${safeName}-proposal.pdf"`,
      "Cache-Control": "private, no-store",
    },
  })
}
