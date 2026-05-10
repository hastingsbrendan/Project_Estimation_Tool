import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { redirect } from "next/navigation"
import {
  addPreset,
  createCatalogItem,
  deleteCatalogItem,
  loadDefaultCatalog,
  removePreset,
  resetCatalogToDefaults,
  updateCatalogItem,
  updatePreset,
} from "../actions"
import { CatalogTable } from "../catalog-table"
import { Card } from "@/components/ui/card"

export default async function MaterialsCatalogPage() {
  const session = await auth()
  if (!session?.user?.email) redirect("/login")
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) redirect("/login")

  // Materials catalog only needs material rows + the user's preset bundle
  // metadata (so changing a material here can show "linked from N services"
  // in a future UI iteration). For now we fetch everything since it's small.
  const [items, presets] = await Promise.all([
    prisma.catalogItem.findMany({
      where: { userId: user.id, archived: false },
      orderBy: [{ trade: "asc" }, { description: "asc" }],
    }),
    prisma.catalogPreset.findMany({
      where: { service: { userId: user.id } },
      include: { material: true },
      orderBy: { material: { description: "asc" } },
    }),
  ])

  const presetsByService = new Map<string, typeof presets>()
  for (const p of presets) {
    const arr = presetsByService.get(p.serviceId) ?? []
    arr.push(p)
    presetsByService.set(p.serviceId, arr)
  }

  const materials = items.filter((i) => i.kind === "material")

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Material catalog</h1>
          <p className="text-sm text-foreground-muted mt-1">
            Materials available in every project. Edits here apply to new projects;
            existing line items keep their original prices unless you click
            &ldquo;Refresh prices&rdquo; on a project.
          </p>
        </div>
        {materials.length > 0 && (
          <p className="text-sm text-foreground-soft tabular-nums shrink-0 ml-4">
            {materials.length} material{materials.length === 1 ? "" : "s"}
          </p>
        )}
      </div>

      {items.length === 0 ? (
        <EmptyState />
      ) : (
        <CatalogTable
          items={items.map((i) => ({
            id: i.id,
            trade: i.trade,
            description: i.description,
            unit: i.unit,
            unitPrice: i.unitPrice,
            kind: i.kind,
            hdSku: i.hdSku,
            notes: i.notes,
          }))}
          presetsByService={Object.fromEntries(
            Array.from(presetsByService.entries()).map(([sid, list]) => [
              sid,
              list.map((p) => ({
                id: p.id,
                materialId: p.materialId,
                materialDescription: p.material.description,
                materialUnit: p.material.unit,
                materialUnitPrice: p.material.unitPrice,
                defaultQty: p.defaultQty,
                notes: p.notes,
              })),
            ]),
          )}
          kindLock="material"
          createAction={createCatalogItem}
          updateAction={updateCatalogItem}
          deleteAction={deleteCatalogItem}
          resetAction={resetCatalogToDefaults}
          addPresetAction={addPreset}
          updatePresetAction={updatePreset}
          removePresetAction={removePreset}
        />
      )}
    </div>
  )
}

function EmptyState() {
  return (
    <Card size="empty">
      <div className="inline-flex items-center justify-center w-14 h-14 bg-accent-soft rounded-2xl mb-4">
        <span className="text-3xl">📦</span>
      </div>
      <h2 className="text-lg font-semibold text-foreground mb-2">Your catalog is empty</h2>
      <p className="text-sm text-foreground-muted max-w-md mx-auto mb-6">
        Load the built-in 300-item starter catalog (covers demo, framing, plumbing,
        electrical, drywall, and finish — both services and materials), or start
        from scratch and add your own.
      </p>
      <div className="flex items-center justify-center gap-3 flex-wrap">
        <form action={loadDefaultCatalog}>
          <button
            type="submit"
            className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors"
          >
            Load 300 starter items
          </button>
        </form>
        <a
          href="#add-form"
          className="px-4 py-2 bg-surface border border-border text-foreground rounded-lg text-sm font-medium hover:bg-surface-muted transition-colors"
        >
          Start from scratch
        </a>
      </div>
    </Card>
  )
}
