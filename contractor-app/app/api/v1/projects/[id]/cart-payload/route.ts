import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { aggregateMaterials, type MaterialRow } from "@/lib/materials"
import { logError, logInfo } from "@/lib/log"
import { checkExtensionVersion } from "@/lib/api-v1/extension-version"

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
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const started = Date.now()
  const versionBlock = checkExtensionVersion(req)
  if (versionBlock) return versionBlock
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

    // Resolve hdSku for each line item via its catalogItemId. We fetch
    // only the catalog rows we actually need (one query, no N+1) and
    // pass the SKU into aggregateMaterials so the cart-builder can
    // use SKU search instead of fuzzy description matching.
    const catalogIds = Array.from(
      new Set(
        allLineItems
          .map((li) => li.catalogItemId)
          .filter((id): id is string => typeof id === "string"),
      ),
    )
    const catalogRows =
      catalogIds.length > 0
        ? await prisma.catalogItem.findMany({
            where: { id: { in: catalogIds }, userId: user.id },
            select: { id: true, hdSku: true },
          })
        : []
    const skuById = new Map<string, string | null>(
      catalogRows.map((c) => [c.id, c.hdSku]),
    )

    const rows: MaterialRow[] = aggregateMaterials(
      allLineItems.map((li) => ({
        description: li.description,
        quantity: li.quantity,
        unit: li.unit,
        unitPrice: li.unitPrice,
        kind: li.kind,
        hdSku: li.catalogItemId ? skuById.get(li.catalogItemId) ?? null : null,
        catalogItemId: li.catalogItemId,
      })),
    )

    const payload = {
      project: {
        id: project.id,
        name: project.name,
        address: project.address,
        clientName: project.clientName,
      },
      materials: rows.map((r) => ({
        description: r.description,
        unit: r.unit,
        quantity: r.quantity,
        estUnitPrice: r.estUnitPrice,
        estSubtotal: r.estSubtotal,
        // Surface the SKU when known; the extension uses it to skip
        // fuzzy text search and navigate straight to the PDP.
        hdSku: r.hdSku,
        // Lets the extension's review flow write a user-confirmed SKU
        // back to the catalog via /api/v1/catalog/set-sku.
        catalogItemId: r.catalogItemId,
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
