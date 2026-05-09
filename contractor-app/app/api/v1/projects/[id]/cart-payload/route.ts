import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { aggregateMaterials, type MaterialRow } from "@/lib/materials"
import { logError, logInfo } from "@/lib/log"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const SCOPE = "/api/v1/projects/[id]/cart-payload"

/**
 * Returns the project's aggregated material list in a shape the
 * Chrome cart-builder extension can consume. Auth via session cookie —
 * the extension's bridge content script makes this fetch under the
 * contractor-app's domain, so the user's existing session is sent
 * automatically.
 *
 * Versioned `v1`: internal app code does NOT import from this layer.
 * Future clients (CLI, mobile, server agent) can use the same endpoint.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const started = Date.now()
  const { id } = await params
  try {
    const session = await auth()
    if (!session?.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 })
    }
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    })
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 })
    }

    const project = await prisma.project.findFirst({
      where: { id, userId: user.id },
      include: {
        sections: {
          include: { lineItems: { orderBy: { order: "asc" } } },
          orderBy: { order: "asc" },
        },
      },
    })
    if (!project) {
      return Response.json({ error: "Project not found" }, { status: 404 })
    }

    const allLineItems = project.sections.flatMap((s) => s.lineItems)
    const rows: MaterialRow[] = aggregateMaterials(allLineItems)

    const payload = {
      project: {
        id: project.id,
        name: project.name,
        address: project.address,
        clientName: project.clientName,
      },
      materials: rows.map((r) => ({
        // No catalogItemId yet — aggregateMaterials groups by description+unit
        // so the link back to a single CatalogItem is approximate. The
        // extension's matcher works off description+unit anyway.
        description: r.description,
        unit: r.unit,
        quantity: r.quantity,
        estUnitPrice: r.estUnitPrice,
        estSubtotal: r.estSubtotal,
        notes: null as string | null,
      })),
      generatedAt: new Date().toISOString(),
    }

    logInfo(SCOPE, "Served cart payload", {
      projectId: id,
      userId: user.id,
      materialCount: rows.length,
      durationMs: Date.now() - started,
    })

    return Response.json(payload, {
      headers: { "Cache-Control": "private, no-store" },
    })
  } catch (e) {
    logError(SCOPE, e, { projectId: id, durationMs: Date.now() - started })
    return Response.json({ error: "Internal error" }, { status: 500 })
  }
}
