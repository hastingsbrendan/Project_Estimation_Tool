import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { aggregateMaterials, materialsTotal } from "@/lib/materials"
import { MaterialsPdf } from "@/lib/pdf/materials-pdf"
import { renderToBuffer } from "@react-pdf/renderer"
import { logError, logInfo } from "@/lib/log"

export const runtime = "nodejs"
export const maxDuration = 60

const SCOPE = "/api/pdf/materials"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const started = Date.now()
  const { id } = await params
  try {
    const session = await auth()
    if (!session?.user?.email) {
      return new Response("Unauthorized", { status: 401 })
    }
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

    const lineItems = project.sections.flatMap((s) => s.lineItems)
    const rows = aggregateMaterials(lineItems)
    const total = materialsTotal(rows)

    const buffer = await renderToBuffer(
      MaterialsPdf({
        projectName: project.name,
        clientName: project.clientName,
        generatedAt: new Date(),
        rows,
        total,
      }),
    )

    const safeName = project.name.replace(/[^a-zA-Z0-9._-]/g, "_") || "project"
    logInfo(SCOPE, "Rendered materials PDF", {
      projectId: id,
      userId: user.id,
      rowCount: rows.length,
      bufferBytes: buffer.byteLength,
      durationMs: Date.now() - started,
    })
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeName}-materials.pdf"`,
        "Cache-Control": "private, no-store",
      },
    })
  } catch (e) {
    logError(SCOPE, e, { projectId: id, durationMs: Date.now() - started })
    throw e
  }
}
