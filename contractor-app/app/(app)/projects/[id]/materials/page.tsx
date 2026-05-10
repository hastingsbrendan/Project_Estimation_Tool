import Link from "next/link"
import { notFound } from "next/navigation"
import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { aggregateMaterials, materialsTotal } from "@/lib/materials"
import { formatCurrency } from "@/lib/calc"
import { CartBuilderButton } from "./cart-builder-button"
import { Card } from "@/components/ui/card"

export default async function MaterialsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await auth()
  if (!session?.user?.email) notFound()
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) notFound()

  const project = await prisma.project.findFirst({
    where: { id, userId: user.id },
    include: {
      sections: {
        include: { lineItems: { orderBy: { order: "asc" } } },
        orderBy: { order: "asc" },
      },
    },
  })
  if (!project) notFound()

  const allLineItems = project.sections.flatMap((s) => s.lineItems)

  // Join through CatalogItem.hdSku so the materials list (and the
  // cart-builder that consumes it) can show the HD SKU per row.
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

  const rows = aggregateMaterials(
    allLineItems.map((li) => ({
      description: li.description,
      quantity: li.quantity,
      unit: li.unit,
      unitPrice: li.unitPrice,
      kind: li.kind,
      hdSku: li.catalogItemId ? skuById.get(li.catalogItemId) ?? null : null,
    })),
  )
  const total = materialsTotal(rows)

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <Link
            href={`/projects/${project.id}`}
            className="text-sm text-foreground-muted hover:text-foreground"
          >
            ← Back to project
          </Link>
          <h1 className="text-xl font-bold text-foreground mt-2">
            {project.name} — Material list
          </h1>
          <p className="text-sm text-foreground-muted mt-1">
            Auto-derived from material line items in this project. Quantities are
            summed across sections when the description and unit match.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <CartBuilderButton projectId={project.id} />
          <a
            href={`/api/pdf/materials/${project.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-accent text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors"
          >
            📄 Download PDF
          </a>
        </div>
      </div>

      {rows.length === 0 ? (
        <Card size="empty">
          <p className="text-sm text-foreground-muted">
            No material line items in this project yet. Add some on the project page,
            then come back to generate a shopping list.
          </p>
        </Card>
      ) : (
        <div className="bg-surface border border-border rounded-lg overflow-hidden">
          <div className="hidden sm:grid grid-cols-12 gap-2 px-4 py-2 bg-surface-muted text-[10px] font-medium uppercase tracking-wider text-foreground-soft">
            <div className="col-span-5">Description</div>
            <div className="col-span-1">HD SKU</div>
            <div className="col-span-1 text-right">Qty</div>
            <div className="col-span-1">Unit</div>
            <div className="col-span-2 text-right">Est $/unit</div>
            <div className="col-span-2 text-right">Subtotal</div>
          </div>
          <div className="divide-y divide-border">
            {rows.map((r, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 px-4 py-2.5 text-sm items-baseline">
                <div className="col-span-12 sm:col-span-5 text-foreground">{r.description}</div>
                <div className="col-span-6 sm:col-span-1 text-xs tabular-nums">
                  {r.hdSku ? (
                    <a
                      href={`https://www.homedepot.com/s/${encodeURIComponent(r.hdSku)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent hover:underline"
                      title="Open this SKU on Home Depot"
                    >
                      {r.hdSku}
                    </a>
                  ) : (
                    <span className="text-foreground-soft">—</span>
                  )}
                </div>
                <div className="col-span-3 sm:col-span-1 text-right tabular-nums text-foreground">
                  {r.quantity}
                </div>
                <div className="col-span-3 sm:col-span-1 text-foreground-muted">{r.unit}</div>
                <div className="col-span-3 sm:col-span-2 text-right tabular-nums text-foreground-muted">
                  {formatCurrency(r.estUnitPrice)}
                </div>
                <div className="col-span-3 sm:col-span-2 text-right tabular-nums font-medium text-foreground">
                  {formatCurrency(r.estSubtotal)}
                </div>
              </div>
            ))}
          </div>
          <div className="border-t-2 border-foreground px-4 py-3 flex items-center justify-end gap-3">
            <span className="text-sm font-semibold text-foreground">Estimated total:</span>
            <span className="text-lg font-bold text-accent tabular-nums">
              {formatCurrency(total)}
            </span>
          </div>
        </div>
      )}

      <p className="text-xs text-foreground-soft italic">
        Estimated prices are from your catalog at the time of viewing. Actual prices may
        vary at the supplier — verify before purchase.
      </p>
    </div>
  )
}
