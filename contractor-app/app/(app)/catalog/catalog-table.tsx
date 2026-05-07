"use client"

import { useMemo, useRef, useState, useTransition } from "react"
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

export type PresetView = {
  id: string
  materialId: string
  materialDescription: string
  materialUnit: string
  materialUnitPrice: number
  defaultQty: number
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
  presetsByService,
  kindLock,
  createAction,
  updateAction,
  deleteAction,
  resetAction,
  addPresetAction,
  updatePresetAction,
  removePresetAction,
}: {
  items: CatalogItemView[]
  presetsByService: Record<string, PresetView[]>
  /**
   * When set, the table is scoped to one catalog kind:
   * - filters visible rows to that kind
   * - hides the kind selector on the Add Item form (auto-sets it)
   * Row-level kind dropdowns stay editable so users can still move items
   * between catalogs by changing the kind.
   */
  kindLock?: "material" | "labor"
  createAction: (formData: FormData) => Promise<void>
  updateAction: (id: string, formData: FormData) => Promise<void>
  deleteAction: (id: string) => Promise<void>
  resetAction: () => Promise<void>
  addPresetAction: (
    serviceId: string,
    formData: FormData,
  ) => Promise<{ ok: boolean; error?: string }>
  updatePresetAction: (
    presetId: string,
    formData: FormData,
  ) => Promise<{ ok: boolean; error?: string }>
  removePresetAction: (presetId: string) => Promise<void>
}) {
  const [search, setSearch] = useState("")
  const [trade, setTrade] = useState<string>("")
  const [showAdd, setShowAdd] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [isPending, startTransition] = useTransition()

  // Apply kindLock first, then user filters.
  const scopedItems = useMemo(
    () => (kindLock ? items.filter((i) => i.kind === kindLock) : items),
    [items, kindLock],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return scopedItems.filter((i) => {
      if (trade && i.trade !== trade) return false
      if (q && !i.description.toLowerCase().includes(q)) return false
      return true
    })
  }, [scopedItems, search, trade])

  // Materials list for the preset typeahead — always sourced from the full
  // items prop (so a Services catalog page still has access to all materials).
  const materials = useMemo(() => items.filter((i) => i.kind === "material"), [items])

  return (
    <div className="space-y-4">
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

      <div className="flex flex-wrap gap-1.5">
        {TRADES.map((t) => {
          const count =
            t.value === ""
              ? scopedItems.length
              : scopedItems.filter((i) => i.trade === t.value).length
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

      {showAdd && (
        <div id="add-form" className="bg-accent-soft/40 border border-accent rounded-lg p-4">
          <form
            action={async (fd) => {
              if (kindLock) fd.set("kind", kindLock)
              await createAction(fd)
              setShowAdd(false)
            }}
            className="grid grid-cols-12 gap-2 items-end text-sm"
          >
            {kindLock && <input type="hidden" name="kind" value={kindLock} />}
            <div className={`col-span-12 ${kindLock ? "sm:col-span-6" : "sm:col-span-4"}`}>
              <label className="block text-xs text-foreground-muted mb-0.5">
                {kindLock === "labor" ? "Service description" : kindLock === "material" ? "Material description" : "Description"} *
              </label>
              <input
                name="description"
                required
                placeholder={kindLock === "labor" ? "e.g. Frame interior partition wall" : "e.g. 2x4 stud, 8ft, SPF"}
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
            {!kindLock && (
              <div className="col-span-6 sm:col-span-2">
                <label className="block text-xs text-foreground-muted mb-0.5">Service / Material</label>
                <select
                  name="kind"
                  defaultValue="material"
                  className="w-full border border-border rounded px-2 py-1.5 bg-surface focus:outline-none focus:ring-1 focus:ring-accent"
                >
                  <option value="material">Material</option>
                  <option value="labor">Service</option>
                </select>
              </div>
            )}
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

      {filtered.length === 0 ? (
        <p className="text-sm text-foreground-soft italic px-1">
          No catalog items match your filters.
        </p>
      ) : (
        <div className="bg-surface border border-border rounded-lg divide-y divide-border">
          <div className="hidden sm:grid grid-cols-12 gap-2 px-4 py-2 bg-surface-muted text-[10px] font-medium uppercase tracking-wider text-foreground-soft">
            <div className={kindLock ? "col-span-7" : "col-span-5"}>Description</div>
            <div className="col-span-2">Trade</div>
            <div className="col-span-1">Unit</div>
            <div className="col-span-1 text-right">Price / unit</div>
            {!kindLock && (
              <div
                className="col-span-2"
                title="Determines whether this rolls up to the project's Services or Materials sub-table"
              >
                Service / Material
              </div>
            )}
            <div className="col-span-1"></div>
          </div>
          {filtered.map((item) => (
            <CatalogRow
              key={item.id}
              item={item}
              presets={item.kind === "labor" ? presetsByService[item.id] ?? [] : []}
              materials={materials}
              kindLock={kindLock}
              updateAction={updateAction}
              deleteAction={deleteAction}
              addPresetAction={addPresetAction}
              updatePresetAction={updatePresetAction}
              removePresetAction={removePresetAction}
            />
          ))}
        </div>
      )}

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
  presets,
  materials,
  kindLock,
  updateAction,
  deleteAction,
  addPresetAction,
  updatePresetAction,
  removePresetAction,
}: {
  item: CatalogItemView
  presets: PresetView[]
  materials: CatalogItemView[]
  kindLock?: "material" | "labor"
  updateAction: (id: string, formData: FormData) => Promise<void>
  deleteAction: (id: string) => Promise<void>
  addPresetAction: (
    serviceId: string,
    formData: FormData,
  ) => Promise<{ ok: boolean; error?: string }>
  updatePresetAction: (
    presetId: string,
    formData: FormData,
  ) => Promise<{ ok: boolean; error?: string }>
  removePresetAction: (presetId: string) => Promise<void>
}) {
  const [isPending, startTransition] = useTransition()
  const [presetsOpen, setPresetsOpen] = useState(false)

  const isLabor = item.kind === "labor"
  const hasPresets = presets.length > 0

  // When kindLock is set, the kind column is hidden so we widen Description.
  // The inner grid is grid-cols-11 (NOT 12) so its columns line up exactly
  // with the header's grid-cols-12 — col-span-X / 11 within col-span-11 / 12
  // = X/12, matching the header's col-span-X / 12 directly.
  const descSpan = kindLock ? "sm:col-span-7" : "sm:col-span-5"

  return (
    <div className="hover:bg-surface-muted/50 transition-colors group">
      <div className="px-4 py-2">
        <div className="grid grid-cols-12 gap-2 items-center text-sm">
          <AutoSaveForm
            action={updateAction.bind(null, item.id)}
            className="col-span-12 sm:col-span-11 grid grid-cols-11 gap-2 items-center"
          >
            <div className={`col-span-12 ${descSpan}`}>
              <input
                name="description"
                defaultValue={item.description}
                className="w-full bg-transparent border-b border-transparent hover:border-border focus:border-accent focus:outline-none px-1 py-0.5 -mx-1 text-foreground"
              />
              {isLabor && (
                <button
                  type="button"
                  onClick={() => setPresetsOpen((v) => !v)}
                  onMouseDown={(e) => e.preventDefault()}
                  className="text-[10px] text-foreground-soft hover:text-accent mt-0.5 px-1 -mx-1"
                  title={hasPresets ? "Show suggested materials" : "Add suggested materials"}
                >
                  {presetsOpen ? "▾" : "▸"} {hasPresets ? `${presets.length} suggested material${presets.length === 1 ? "" : "s"}` : "Add suggested materials"}
                </button>
              )}
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
            {!kindLock && (
              <div className="col-span-3 sm:col-span-2">
                <select
                  name="kind"
                  defaultValue={item.kind}
                  className={`w-full text-xs font-medium rounded-full px-2.5 py-0.5 cursor-pointer focus:outline-none focus:ring-1 focus:ring-accent appearance-none ${
                    item.kind === "labor"
                      ? "bg-blue-50 text-blue-700 border border-blue-200"
                      : "bg-amber-50 text-amber-800 border border-amber-200"
                  }`}
                  title="Service rolls up to Services sub-table; Material rolls up to Materials sub-table"
                >
                  <option value="material">Material</option>
                  <option value="labor">Service</option>
                </select>
              </div>
            )}
            {/* When kindLock is set we still need to submit the kind so the
                row never accidentally gets mutated to a different kind by
                AutoSaveForm. */}
            {kindLock && <input type="hidden" name="kind" value={kindLock} />}
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

      {isLabor && presetsOpen && (
        <PresetsPanel
          serviceId={item.id}
          serviceDescription={item.description}
          presets={presets}
          materials={materials}
          addAction={addPresetAction}
          updateAction={updatePresetAction}
          removeAction={removePresetAction}
        />
      )}
    </div>
  )
}

function PresetsPanel({
  serviceId,
  serviceDescription,
  presets,
  materials,
  addAction,
  updateAction,
  removeAction,
}: {
  serviceId: string
  serviceDescription: string
  presets: PresetView[]
  materials: CatalogItemView[]
  addAction: (serviceId: string, formData: FormData) => Promise<{ ok: boolean; error?: string }>
  updateAction: (presetId: string, formData: FormData) => Promise<{ ok: boolean; error?: string }>
  removeAction: (presetId: string) => Promise<void>
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string>("")
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const [selectedMaterialId, setSelectedMaterialId] = useState<string>("")
  const [selectedLabel, setSelectedLabel] = useState<string>("")
  const formRef = useRef<HTMLFormElement>(null)

  const linkedIds = useMemo(() => new Set(presets.map((p) => p.materialId)), [presets])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    let pool = materials.filter((m) => !linkedIds.has(m.id))
    if (q) pool = pool.filter((m) => m.description.toLowerCase().includes(q))
    return pool.slice(0, 10)
  }, [materials, linkedIds, query])

  return (
    <div className="bg-accent-soft/30 border-t border-border px-4 py-3">
      <p className="text-xs text-foreground-soft mb-2">
        Suggested materials when this service is added to a project
      </p>

      {presets.length > 0 && (
        <ul className="space-y-1 mb-3">
          {presets.map((p) => (
            <li
              key={p.id}
              className="grid grid-cols-12 gap-2 items-center text-sm bg-surface border border-border rounded px-2 py-1.5"
            >
              <div className="col-span-12 sm:col-span-7 truncate text-foreground">
                {p.materialDescription}
                <span className="text-[10px] text-foreground-soft ml-2 tabular-nums">
                  ${p.materialUnitPrice.toFixed(2)}/{p.materialUnit}
                </span>
              </div>
              <AutoSaveForm
                action={updateAction.bind(null, p.id)}
                className="col-span-9 sm:col-span-4 flex items-center gap-1.5"
              >
                <label className="text-[10px] text-foreground-soft">Default qty:</label>
                <input
                  name="defaultQty"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={p.defaultQty}
                  className="w-20 border border-border rounded px-1.5 py-0.5 bg-surface text-xs tabular-nums text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
                />
                <span className="text-[10px] text-foreground-soft">{p.materialUnit}</span>
              </AutoSaveForm>
              <div className="col-span-3 sm:col-span-1 flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    if (!confirm(`Remove "${p.materialDescription}" from this service's presets?`)) return
                    startTransition(async () => {
                      await removeAction(p.id)
                    })
                  }}
                  className="text-xs text-foreground-soft hover:text-danger transition-colors"
                  title="Remove preset"
                >
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form
        ref={formRef}
        action={(fd) =>
          startTransition(async () => {
            setError("")
            if (!selectedMaterialId) {
              setError("Pick a material from the dropdown")
              return
            }
            fd.set("materialId", selectedMaterialId)
            const r = await addAction(serviceId, fd)
            if (!r.ok) {
              setError(r.error ?? "Failed to add preset")
              return
            }
            // Reset
            setQuery("")
            setSelectedMaterialId("")
            setSelectedLabel("")
            formRef.current?.reset()
          })
        }
        className="flex flex-wrap items-end gap-2"
      >
        <div className="flex-1 min-w-48 relative">
          <label className="block text-[10px] text-foreground-muted mb-0.5">
            Add material to {serviceDescription.length > 30 ? serviceDescription.slice(0, 30) + "…" : serviceDescription}
          </label>
          <input
            type="text"
            value={query || selectedLabel}
            onChange={(e) => {
              setQuery(e.target.value)
              setSelectedMaterialId("")
              setSelectedLabel("")
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            placeholder={
              materials.length === 0
                ? "Add a material to your catalog first…"
                : "Search materials…"
            }
            className="w-full border border-border rounded px-2 py-1 bg-surface focus:outline-none focus:ring-1 focus:ring-accent text-sm"
            autoComplete="off"
          />
          {open && matches.length > 0 && (
            <div className="absolute z-10 left-0 right-0 mt-1 max-h-56 overflow-y-auto bg-surface border border-border rounded-md shadow-lg">
              {matches.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setSelectedMaterialId(m.id)
                    setSelectedLabel(m.description)
                    setQuery("")
                    setOpen(false)
                  }}
                  className="w-full text-left px-2 py-1.5 hover:bg-accent-soft text-xs flex items-center justify-between gap-2"
                >
                  <span className="flex-1 truncate text-foreground">{m.description}</span>
                  <span className="text-[10px] text-foreground-soft tabular-nums">
                    ${m.unitPrice.toFixed(2)}/{m.unit}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          <label className="block text-[10px] text-foreground-muted mb-0.5">Default qty</label>
          <input
            name="defaultQty"
            type="number"
            step="0.01"
            min="0"
            defaultValue="1"
            className="w-20 border border-border rounded px-2 py-1 bg-surface text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
        <button
          type="submit"
          disabled={isPending || !selectedMaterialId}
          className="px-3 py-1 bg-accent text-white rounded text-xs font-medium hover:bg-accent-hover disabled:opacity-50"
        >
          {isPending ? "Adding…" : "Add"}
        </button>
        {error && <span className="text-xs text-danger w-full">{error}</span>}
      </form>
    </div>
  )
}
