"use client"

import { useMemo, useState, useTransition } from "react"
import { AutoSaveForm } from "../projects/[id]/auto-form"

type CatalogItemView = {
  id: string
  trade: string
  description: string
  unit: string
  unitPrice: number
  kind: string
  notes: string | null
}

const TRADES = [
  { value: "", label: "All" },
  { value: "demo", label: "Demo" },
  { value: "framing", label: "Framing" },
  { value: "plumbing", label: "Plumbing" },
  { value: "electrical", label: "Electrical" },
  { value: "drywall", label: "Drywall" },
  { value: "finish", label: "Finish" },
] as const

export function CatalogTable({
  items,
  createAction,
  updateAction,
  deleteAction,
  resetAction,
}: {
  items: CatalogItemView[]
  createAction: (formData: FormData) => Promise<void>
  updateAction: (id: string, formData: FormData) => Promise<void>
  deleteAction: (id: string) => Promise<void>
  resetAction: () => Promise<void>
}) {
  const [search, setSearch] = useState("")
  const [trade, setTrade] = useState<string>("")
  const [showAdd, setShowAdd] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [isPending, startTransition] = useTransition()

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((i) => {
      if (trade && i.trade !== trade) return false
      if (q && !i.description.toLowerCase().includes(q)) return false
      return true
    })
  }, [items, search, trade])

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="search"
          placeholder="Search description…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-48 border border-border rounded-lg px-3 py-2 text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent"
        />
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors shrink-0"
        >
          + Add item
        </button>
      </div>

      {/* Trade filter chips */}
      <div className="flex flex-wrap gap-1.5">
        {TRADES.map((t) => {
          const count =
            t.value === ""
              ? items.length
              : items.filter((i) => i.trade === t.value).length
          return (
            <button
              key={t.value}
              type="button"
              onClick={() => setTrade(t.value)}
              className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
                trade === t.value
                  ? "bg-accent text-white"
                  : "bg-surface border border-border text-foreground-muted hover:bg-accent-soft hover:text-foreground"
              }`}
            >
              {t.label} <span className="opacity-60 tabular-nums">({count})</span>
            </button>
          )
        })}
      </div>

      {/* Add form (collapsible) */}
      {showAdd && (
        <div id="add-form" className="bg-accent-soft/40 border border-accent rounded-lg p-4">
          <form
            action={async (fd) => {
              await createAction(fd)
              setShowAdd(false)
            }}
            className="grid grid-cols-12 gap-2 items-end text-sm"
          >
            <div className="col-span-12 sm:col-span-4">
              <label className="block text-xs text-foreground-muted mb-0.5">Description *</label>
              <input
                name="description"
                required
                placeholder="e.g. 2x4 stud, 8ft, SPF"
                className="w-full border border-border rounded px-2 py-1.5 bg-surface focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
            <div className="col-span-6 sm:col-span-2">
              <label className="block text-xs text-foreground-muted mb-0.5">Trade</label>
              <select
                name="trade"
                defaultValue="finish"
                className="w-full border border-border rounded px-2 py-1.5 bg-surface focus:outline-none focus:ring-1 focus:ring-accent"
              >
                {TRADES.filter((t) => t.value).map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-3 sm:col-span-1">
              <label className="block text-xs text-foreground-muted mb-0.5">Unit</label>
              <input
                name="unit"
                defaultValue="ea"
                className="w-full border border-border rounded px-2 py-1.5 bg-surface focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
            <div className="col-span-3 sm:col-span-2">
              <label className="block text-xs text-foreground-muted mb-0.5">Price (per unit)</label>
              <div className="relative">
                <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-foreground-soft text-sm">
                  $
                </span>
                <input
                  name="unitPrice"
                  type="number"
                  step="0.01"
                  defaultValue="0"
                  className="w-full border border-border rounded pl-6 pr-2 py-1.5 bg-surface focus:outline-none focus:ring-1 focus:ring-accent tabular-nums"
                />
              </div>
            </div>
            <div className="col-span-6 sm:col-span-2">
              <label className="block text-xs text-foreground-muted mb-0.5">Type</label>
              <select
                name="kind"
                defaultValue="material"
                className="w-full border border-border rounded px-2 py-1.5 bg-surface focus:outline-none focus:ring-1 focus:ring-accent"
              >
                <option value="material">Material</option>
                <option value="labor">Labor</option>
              </select>
            </div>
            <div className="col-span-12 sm:col-span-1 flex gap-1">
              <button
                type="submit"
                className="flex-1 px-2 py-1.5 bg-accent text-white rounded text-xs font-medium hover:bg-accent-hover"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                className="px-2 py-1.5 bg-surface border border-border text-foreground-muted rounded text-xs font-medium hover:bg-surface-muted"
                title="Cancel"
              >
                ✕
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Results list */}
      {filtered.length === 0 ? (
        <p className="text-sm text-foreground-soft italic px-1">
          No catalog items match your filters.
        </p>
      ) : (
        <div className="bg-surface border border-border rounded-lg divide-y divide-border">
          <div className="hidden sm:grid grid-cols-12 gap-2 px-4 py-2 bg-surface-muted text-[10px] font-medium uppercase tracking-wider text-foreground-soft">
            <div className="col-span-5">Description</div>
            <div className="col-span-2">Trade</div>
            <div className="col-span-1">Unit</div>
            <div className="col-span-1 text-right">Price / unit</div>
            <div className="col-span-2">Type</div>
            <div className="col-span-1"></div>
          </div>
          {filtered.map((item) => (
            <CatalogRow
              key={item.id}
              item={item}
              updateAction={updateAction}
              deleteAction={deleteAction}
            />
          ))}
        </div>
      )}

      {/* Reset to defaults */}
      <div className="pt-4 border-t border-border">
        <details className="text-xs text-foreground-soft">
          <summary className="cursor-pointer hover:text-foreground transition-colors inline-flex items-center gap-1">
            ⚠ Danger zone
          </summary>
          <div className="mt-3 space-y-2">
            <p>
              <strong className="text-foreground">Reset catalog to defaults</strong> —
              Wipes your entire catalog and replaces it with the 300-item starter
              catalog. Existing project line items stay intact (their snapshot
              prices are preserved); only the catalog itself is replaced.
            </p>
            {!confirmReset ? (
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                className="px-3 py-1.5 text-xs border border-border rounded text-foreground-muted hover:bg-surface-muted hover:text-foreground"
              >
                Reset catalog…
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-foreground font-medium">
                  Replace all {items.length} items with defaults?
                </span>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() =>
                    startTransition(async () => {
                      await resetAction()
                      setConfirmReset(false)
                    })
                  }
                  className="px-3 py-1.5 text-xs bg-danger text-white rounded font-medium hover:opacity-90 disabled:opacity-50"
                >
                  {isPending ? "Resetting…" : "Yes, reset"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmReset(false)}
                  className="px-3 py-1.5 text-xs border border-border rounded text-foreground-muted hover:bg-surface-muted"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </details>
      </div>
    </div>
  )
}

function CatalogRow({
  item,
  updateAction,
  deleteAction,
}: {
  item: CatalogItemView
  updateAction: (id: string, formData: FormData) => Promise<void>
  deleteAction: (id: string) => Promise<void>
}) {
  const [isPending, startTransition] = useTransition()
  return (
    <div className="px-4 py-2 hover:bg-surface-muted/50 transition-colors group">
      <div className="grid grid-cols-12 gap-2 items-center text-sm">
        <AutoSaveForm
          action={updateAction.bind(null, item.id)}
          className="col-span-12 sm:col-span-11 grid grid-cols-12 gap-2 items-center"
        >
          <div className="col-span-12 sm:col-span-5">
            <input
              name="description"
              defaultValue={item.description}
              className="w-full bg-transparent border-b border-transparent hover:border-border focus:border-accent focus:outline-none px-1 py-0.5 -mx-1 text-foreground"
            />
          </div>
          <div className="col-span-3 sm:col-span-2">
            <select
              name="trade"
              defaultValue={item.trade}
              className="w-full bg-transparent border-b border-transparent hover:border-border focus:border-accent focus:outline-none px-1 py-0.5 -mx-1 text-foreground"
            >
              {TRADES.filter((t) => t.value).map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-3 sm:col-span-1">
            <input
              name="unit"
              defaultValue={item.unit}
              className="w-full bg-transparent border-b border-transparent hover:border-border focus:border-accent focus:outline-none px-1 py-0.5 -mx-1 text-foreground"
            />
          </div>
          <div className="col-span-3 sm:col-span-1 text-right">
            <div className="relative">
              <span
                className="pointer-events-none absolute left-1 top-1/2 -translate-y-1/2 text-foreground-soft text-xs"
                aria-hidden="true"
              >
                $
              </span>
              <input
                name="unitPrice"
                type="number"
                step="0.01"
                defaultValue={item.unitPrice}
                className="w-full bg-transparent border-b border-transparent hover:border-border focus:border-accent focus:outline-none pl-4 pr-1 py-0.5 tabular-nums text-foreground text-right"
              />
            </div>
            <div className="text-[10px] text-foreground-soft text-right -mt-1">
              per {item.unit}
            </div>
          </div>
          <div className="col-span-3 sm:col-span-2">
            <select
              name="kind"
              defaultValue={item.kind}
              className="w-full bg-transparent border-b border-transparent hover:border-border focus:border-accent focus:outline-none px-1 py-0.5 -mx-1 text-foreground"
            >
              <option value="material">Material</option>
              <option value="labor">Labor</option>
            </select>
          </div>
        </AutoSaveForm>
        <div className="col-span-12 sm:col-span-1 flex justify-end">
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              if (!confirm(`Delete "${item.description}"?`)) return
              startTransition(async () => {
                await deleteAction(item.id)
              })
            }}
            className="text-xs text-foreground-soft opacity-0 group-hover:opacity-100 hover:text-danger transition-all disabled:opacity-50"
            title="Delete item"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  )
}
