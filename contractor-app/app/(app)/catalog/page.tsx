import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { redirect } from "next/navigation"
import {
  createCatalogItem,
  deleteCatalogItem,
  loadDefaultCatalog,
  resetCatalogToDefaults,
  updateCatalogItem,
} from "./actions"
import { CatalogTable } from "./catalog-table"

export default async function CatalogPage() {
  const session = await auth()
  if (!session?.user?.email) redirect("/login")
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) redirect("/login")

  const items = await prisma.catalogItem.findMany({
    where: { userId: user.id, archived: false },
    orderBy: [{ trade: "asc" }, { description: "asc" }],
  })

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Catalog</h1>
          <p className="text-sm text-foreground-muted mt-1">
            Your saved line items, available in every project. Edits here apply to new
            projects; existing line items keep their original prices unless you click
            &ldquo;Refresh prices&rdquo; on a project.
          </p>
        </div>
        {items.length > 0 && (
          <p className="text-sm text-foreground-soft tabular-nums shrink-0 ml-4">
            {items.length} item{items.length === 1 ? "" : "s"}
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
            notes: i.notes,
          }))}
          createAction={createCatalogItem}
          updateAction={updateCatalogItem}
          deleteAction={deleteCatalogItem}
          resetAction={resetCatalogToDefaults}
        />
      )}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="bg-surface border border-border rounded-lg p-8 text-center">
      <div className="inline-flex items-center justify-center w-14 h-14 bg-accent-soft rounded-2xl mb-4">
        <span className="text-3xl">📚</span>
      </div>
      <h2 className="text-lg font-semibold text-foreground mb-2">Your catalog is empty</h2>
      <p className="text-sm text-foreground-muted max-w-md mx-auto mb-6">
        Load the built-in 300-item starter catalog (covers demo, framing, plumbing,
        electrical, drywall, and finish), or start from scratch and add your own.
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
    </div>
  )
}
