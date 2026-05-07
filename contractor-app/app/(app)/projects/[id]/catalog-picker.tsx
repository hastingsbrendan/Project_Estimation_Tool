"use client"

import { useId, useMemo, useRef, useState } from "react"
import type { AddLineItemResult } from "./actions"

export type CatalogPickerItem = {
  id: string
  trade: string
  description: string
  unit: string
  unitPrice: number
  kind: string
}

const TRADE_LABELS: Record<string, string> = {
  demo: "Demo",
  framing: "Framing",
  plumbing: "Plumbing",
  electrical: "Electrical",
  drywall: "Drywall",
  finish: "Finish",
}

/**
 * Add Line Item form with a catalog typeahead. Catalog items come from the
 * user's saved catalog (filtered to the locked kind, if any). Selecting a
 * catalog item fills in description/unit/unitPrice/kind AND records the
 * catalogItemId so we can offer "refresh prices" later.
 *
 * When `lockKind` is set, the kind <select> is hidden, the dropdown is
 * filtered to that kind, and the form submits with the locked kind. Used
 * to render two separate pickers (Services + Materials) per section.
 *
 * `onAfterAdd` fires after a successful submit with the server result so
 * the parent can chain follow-up UI (e.g. surfacing service presets).
 */
export function AddLineItemForm({
  action,
  catalog,
  lockKind,
  onAfterAdd,
  placeholder,
  buttonLabel,
}: {
  action: (formData: FormData) => Promise<AddLineItemResult>
  catalog: CatalogPickerItem[]
  lockKind?: "material" | "labor"
  onAfterAdd?: (result: AddLineItemResult) => void
  placeholder?: string
  buttonLabel?: string
}) {
  const id = useId()
  const [query, setQuery] = useState("")
  const [tradeFilter, setTradeFilter] = useState<string>("")
  const [open, setOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string>("")
  const descRef = useRef<HTMLInputElement>(null)
  const unitRef = useRef<HTMLInputElement>(null)
  const priceRef = useRef<HTMLInputElement>(null)
  const kindRef = useRef<HTMLSelectElement>(null)
  const formRef = useRef<HTMLFormElement>(null)

  // When the picker is locked to a kind, only show that kind in the dropdown.
  const scopedCatalog = useMemo(
    () => (lockKind ? catalog.filter((c) => c.kind === lockKind) : catalog),
    [catalog, lockKind],
  )

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    let pool = scopedCatalog
    if (tradeFilter) pool = pool.filter((c) => c.trade === tradeFilter)
    if (q.length === 0) return pool.slice(0, 8)
    return pool.filter((c) => c.description.toLowerCase().includes(q)).slice(0, 12)
  }, [scopedCatalog, query, tradeFilter])

  const pick = (item: CatalogPickerItem) => {
    setQuery(item.description)
    setSelectedId(item.id)
    if (descRef.current) descRef.current.value = item.description
    if (unitRef.current) unitRef.current.value = item.unit
    if (priceRef.current) priceRef.current.value = String(item.unitPrice)
    if (!lockKind && kindRef.current) kindRef.current.value = item.kind
    setOpen(false)
  }

  const effectivePlaceholder =
    placeholder ??
    (scopedCatalog.length === 0
      ? lockKind === "labor"
        ? "Type a service description (no labor items in catalog yet)…"
        : lockKind === "material"
          ? "Type a description (no materials in catalog yet)…"
          : "Type a description (catalog is empty)…"
      : lockKind === "labor"
        ? "Search services or type custom…"
        : lockKind === "material"
          ? "Search materials or type custom…"
          : "Search catalog or type custom…")

  return (
    <form
      ref={formRef}
      action={async (fd) => {
        // If a kind is locked, force it onto the form regardless of any
        // previously-typed value or stale ref.
        if (lockKind) fd.set("kind", lockKind)
        const result = await action(fd)
        formRef.current?.reset()
        setQuery("")
        setSelectedId("")
        setOpen(false)
        onAfterAdd?.(result)
      }}
      className="px-4 py-3 border-t border-border bg-surface-muted/50 rounded-b-lg"
    >
      <input type="hidden" name="catalogItemId" value={selectedId} />
      {lockKind && <input type="hidden" name="kind" value={lockKind} />}
      <div className="grid grid-cols-12 gap-2 items-end text-sm">
        <div className={`col-span-12 ${lockKind ? "sm:col-span-6" : "sm:col-span-5"} relative`}>
          <label htmlFor={`${id}-desc`} className="block text-xs text-foreground-muted mb-0.5">
            Description
          </label>
          <input
            id={`${id}-desc`}
            ref={descRef}
            name="description"
            required
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSelectedId("")
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            placeholder={effectivePlaceholder}
            className="w-full border border-border rounded px-2 py-1 bg-surface focus:outline-none focus:ring-1 focus:ring-accent"
            autoComplete="off"
          />
          {open && matches.length > 0 && (
            <div className="absolute z-20 left-0 right-0 mt-1 max-h-72 overflow-y-auto bg-surface border border-border rounded-md shadow-lg">
              <div className="sticky top-0 bg-surface-muted border-b border-border px-2 py-1 flex flex-wrap gap-1">
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setTradeFilter("")}
                  className={`text-[10px] px-1.5 py-0.5 rounded ${
                    tradeFilter === ""
                      ? "bg-accent text-white"
                      : "bg-surface text-foreground-muted hover:bg-accent-soft"
                  }`}
                >
                  All
                </button>
                {Object.entries(TRADE_LABELS).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setTradeFilter(key)}
                    className={`text-[10px] px-1.5 py-0.5 rounded ${
                      tradeFilter === key
                        ? "bg-accent text-white"
                        : "bg-surface text-foreground-muted hover:bg-accent-soft"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <ul>
                {matches.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => pick(item)}
                      className="w-full text-left px-2 py-1.5 hover:bg-accent-soft text-xs flex items-center justify-between gap-2"
                    >
                      <span className="flex-1 truncate text-foreground">{item.description}</span>
                      <span className="text-[10px] text-foreground-soft tabular-nums">
                        ${item.unitPrice.toFixed(2)}/{item.unit}
                      </span>
                      {!lockKind && (
                        <span className="text-[10px] uppercase text-foreground-soft w-3 text-center">
                          {item.kind === "labor" ? "S" : "M"}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="col-span-3 sm:col-span-1">
          <label className="block text-xs text-foreground-muted mb-0.5">Qty</label>
          <input
            name="quantity"
            type="number"
            step="0.01"
            defaultValue="1"
            className="w-full border border-border rounded px-2 py-1 bg-surface focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
        <div className="col-span-3 sm:col-span-1">
          <label className="block text-xs text-foreground-muted mb-0.5">Unit</label>
          <input
            ref={unitRef}
            name="unit"
            defaultValue={lockKind === "labor" ? "hr" : "ea"}
            className="w-full border border-border rounded px-2 py-1 bg-surface focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
        <div className="col-span-3 sm:col-span-2">
          <label className="block text-xs text-foreground-muted mb-0.5">Unit $</label>
          <input
            ref={priceRef}
            name="unitPrice"
            type="number"
            step="0.01"
            defaultValue="0"
            className="w-full border border-border rounded px-2 py-1 bg-surface focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
        {!lockKind && (
          <div className="col-span-3 sm:col-span-2">
            <label className="block text-xs text-foreground-muted mb-0.5">Type</label>
            <select
              ref={kindRef}
              name="kind"
              defaultValue="material"
              className="w-full border border-border rounded px-2 py-1 bg-surface focus:outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="material">Material</option>
              <option value="labor">Service</option>
            </select>
          </div>
        )}
        <div className="col-span-12 sm:col-span-1">
          <button
            type="submit"
            className="w-full px-2 py-1 bg-accent text-white rounded text-xs font-medium hover:bg-accent-hover"
          >
            {buttonLabel ?? "Add"}
          </button>
        </div>
      </div>
    </form>
  )
}
