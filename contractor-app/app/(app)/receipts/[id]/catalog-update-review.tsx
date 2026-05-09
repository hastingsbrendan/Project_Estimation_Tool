"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import type {
  CatalogUpdatePreview,
  CatalogUpdateDecision,
} from "../actions"
import { TRADES } from "@/lib/catalog/trades"
import { WarningChip } from "@/components/ui/warning-chip"

/**
 * Per-row state the review screen tracks. Mirrors the three buckets but
 * each row carries its own "applied?" toggle + the editable bits the
 * contractor can override before clicking Apply.
 */
type LikelyState = {
  type: "likely"
  receiptItemId: string
  catalogItemId: string
  description: string
  unit: string
  currentPrice: number
  newPrice: number // editable
  deltaPct: number
  apply: boolean // default OFF — explicit opt-in per the plan
  receiptSku: string | null // from receipt parse
  catalogSku: string | null // already on the catalog row
  /**
   * Whether to write receiptSku onto the catalog row when applying.
   * Default ON when catalog has no SKU and receipt does; OFF when
   * the SKUs conflict (we surface the conflict and let the user
   * pick explicitly to overwrite).
   */
  applySku: boolean
}

type UncertainState = {
  type: "uncertain"
  receiptItemId: string
  description: string
  unit: string
  parsedPrice: number
  candidates: CatalogUpdatePreview["uncertain"][number]["candidates"]
  // Resolution: pick a candidate (apply price update) OR mark as new
  resolution: "skip" | "match" | "new"
  pickedCatalogItemId: string | null
  // For the "new" path:
  newPrice: number
  newTrade: string
  receiptSku: string | null
}

type NewState = {
  type: "new"
  receiptItemId: string
  description: string // editable
  unit: string // editable
  trade: string // editable
  price: number // editable
  apply: boolean // default ON — contractor opted in by uploading a catalog receipt
  /** SKU parsed off the receipt; editable so user can fix or fill in. */
  hdSku: string
}

type RowState = LikelyState | UncertainState | NewState

export function CatalogUpdateReview({
  preview,
  alreadyReviewed,
  applyAction,
}: {
  preview: CatalogUpdatePreview
  alreadyReviewed: boolean
  applyAction: (
    decisions: CatalogUpdateDecision[],
  ) => Promise<{ ok: boolean; updatedCount: number; createdCount: number; error?: string }>
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState("")
  const [success, setSuccess] = useState<{ updated: number; created: number } | null>(
    null,
  )

  const initial = useMemo<RowState[]>(() => {
    const rows: RowState[] = []
    for (const m of preview.matches) {
      // Default applySku ON when the catalog has no SKU yet OR they
      // already match; OFF when they conflict (forces a deliberate
      // overwrite via the conflict UI below).
      const skuConflict =
        !!m.catalogSku && !!m.receiptSku && m.catalogSku !== m.receiptSku
      rows.push({
        type: "likely",
        receiptItemId: m.receiptItemId,
        catalogItemId: m.catalogItemId,
        description: m.description,
        unit: m.unit,
        currentPrice: m.currentPrice,
        newPrice: m.newPrice,
        deltaPct: m.deltaPct,
        apply: false,
        receiptSku: m.receiptSku,
        catalogSku: m.catalogSku,
        applySku: !!m.receiptSku && !skuConflict && !m.catalogSku,
      })
    }
    for (const u of preview.uncertain) {
      rows.push({
        type: "uncertain",
        receiptItemId: u.receiptItemId,
        description: u.description,
        unit: u.unit,
        parsedPrice: u.parsedPrice,
        candidates: u.candidates,
        resolution: "skip",
        pickedCatalogItemId: u.candidates[0]?.catalogItemId ?? null,
        newPrice: u.parsedPrice,
        newTrade: "finish",
        receiptSku: u.receiptSku,
      })
    }
    for (const n of preview.newItems) {
      rows.push({
        type: "new",
        receiptItemId: n.receiptItemId,
        description: n.description,
        unit: n.unit,
        trade: n.suggestedTrade,
        price: n.suggestedPrice,
        apply: true,
        hdSku: n.receiptSku ?? "",
      })
    }
    return rows
  }, [preview])

  const [rows, setRows] = useState<RowState[]>(initial)

  function patchRow<T extends RowState>(idx: number, patch: Partial<T>) {
    setRows((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], ...patch } as RowState
      return next
    })
  }

  // Counts for the footer summary.
  const summary = rows.reduce(
    (acc, r) => {
      if (r.type === "likely") {
        if (r.apply) acc.updates++
      } else if (r.type === "uncertain") {
        if (r.resolution === "match") acc.updates++
        else if (r.resolution === "new") acc.creates++
      } else if (r.type === "new") {
        if (r.apply) acc.creates++
      }
      return acc
    },
    { updates: 0, creates: 0 },
  )
  const skipped = rows.length - summary.updates - summary.creates

  const newCount = preview.newItems.length

  function buildDecisions(): CatalogUpdateDecision[] {
    const out: CatalogUpdateDecision[] = []
    for (const r of rows) {
      if (r.type === "likely") {
        if (r.apply) {
          out.push({
            action: "update-price",
            receiptItemId: r.receiptItemId,
            catalogItemId: r.catalogItemId,
            newPrice: r.newPrice,
            hdSku: r.applySku ? r.receiptSku : null,
          })
        } else {
          out.push({ action: "skip", receiptItemId: r.receiptItemId })
        }
      } else if (r.type === "uncertain") {
        if (r.resolution === "match" && r.pickedCatalogItemId) {
          out.push({
            action: "update-price",
            receiptItemId: r.receiptItemId,
            catalogItemId: r.pickedCatalogItemId,
            newPrice: r.parsedPrice,
            // For uncertain rows, default to applying the SKU when
            // we have one — the user just confirmed the match.
            hdSku: r.receiptSku,
          })
        } else if (r.resolution === "new") {
          out.push({
            action: "add-new",
            receiptItemId: r.receiptItemId,
            description: r.description,
            unit: r.unit,
            trade: r.newTrade,
            price: r.newPrice,
            hdSku: r.receiptSku,
          })
        } else {
          out.push({ action: "skip", receiptItemId: r.receiptItemId })
        }
      } else if (r.type === "new") {
        if (r.apply) {
          out.push({
            action: "add-new",
            receiptItemId: r.receiptItemId,
            description: r.description,
            unit: r.unit,
            trade: r.trade,
            price: r.price,
            hdSku: r.hdSku.trim() || null,
          })
        } else {
          out.push({ action: "skip", receiptItemId: r.receiptItemId })
        }
      }
    }
    return out
  }

  function submit() {
    startTransition(async () => {
      setError("")
      setSuccess(null)
      const decisions = buildDecisions()
      const r = await applyAction(decisions)
      if (!r.ok) {
        setError(r.error ?? "Could not apply")
        return
      }
      setSuccess({ updated: r.updatedCount, created: r.createdCount })
      router.refresh()
    })
  }

  if (alreadyReviewed && !success) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-5">
        <p className="text-sm font-semibold text-green-900">
          Catalog updates already applied for this receipt.
        </p>
        <p className="text-sm text-green-800 mt-1">
          Re-review isn&rsquo;t needed. If you want to undo or re-apply, edit
          the catalog directly at{" "}
          <a href="/catalog/services" className="underline">
            /catalog
          </a>
          .
        </p>
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="bg-surface border border-border rounded-lg p-5 text-sm text-foreground-soft italic">
        Nothing parsed from this receipt yet. Re-parse with AI, or enter items
        manually below.
      </div>
    )
  }

  const likelyRows = rows.filter((r) => r.type === "likely") as LikelyState[]
  const uncertainRows = rows.filter((r) => r.type === "uncertain") as UncertainState[]
  const newRows = rows.filter((r) => r.type === "new") as NewState[]

  return (
    <div className="space-y-5">
      {newCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-sm text-amber-900 flex items-center justify-between gap-3 flex-wrap">
          <p>
            <strong>{newCount} new catalog items detected.</strong> Scroll down
            to review and add them.
          </p>
          <a href="#new-items" className="underline font-medium">
            Jump to new items ↓
          </a>
        </div>
      )}

      {/* LIKELY MATCHES */}
      {likelyRows.length > 0 && (
        <section className="bg-surface border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-2 bg-surface-muted border-b border-border">
            <p className="text-xs font-medium text-foreground-muted uppercase tracking-wider">
              Likely matches ({likelyRows.length}) — already in your catalog
            </p>
          </div>
          {/* Mobile: 5-column table won't fit on a 375px viewport.
              Allow horizontal scroll inside the section so the rest of
              the layout stays put. */}
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead className="text-xs text-foreground-soft uppercase tracking-wider">
              <tr>
                <th className="text-left px-3 py-2 w-8">Apply</th>
                <th className="text-left px-3 py-2">Item</th>
                <th className="text-right px-3 py-2">Now</th>
                <th className="text-right px-3 py-2">New</th>
                <th className="text-right px-3 py-2">Δ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {likelyRows.map((r) => {
                const idx = rows.indexOf(r)
                return (
                  <tr key={r.receiptItemId} className="hover:bg-surface-muted/40">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={r.apply}
                        onChange={(e) =>
                          patchRow<LikelyState>(idx, { apply: e.target.checked })
                        }
                        className="accent-accent"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="text-foreground">{r.description}</div>
                      <div className="text-[11px] text-foreground-soft">
                        per {r.unit}
                      </div>
                      <SkuRow
                        receiptSku={r.receiptSku}
                        catalogSku={r.catalogSku}
                        applySku={r.applySku}
                        onToggleApply={(v) =>
                          patchRow<LikelyState>(idx, { applySku: v })
                        }
                      />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-foreground-soft">
                      ${r.currentPrice.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        value={r.newPrice}
                        onChange={(e) =>
                          patchRow<LikelyState>(idx, {
                            newPrice: Number(e.target.value) || 0,
                          })
                        }
                        className="w-20 text-right tabular-nums border border-border rounded px-2 py-1 bg-surface focus:outline-none focus:ring-1 focus:ring-accent"
                      />
                    </td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums ${
                        r.deltaPct > 0
                          ? "text-warning"
                          : r.deltaPct < 0
                            ? "text-success"
                            : "text-foreground-soft"
                      }`}
                    >
                      {r.deltaPct > 0 ? "+" : ""}
                      {r.deltaPct.toFixed(1)}%
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        </section>
      )}

      {/* UNCERTAIN */}
      {uncertainRows.length > 0 && (
        <section className="bg-surface border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-2 bg-surface-muted border-b border-border">
            <p className="text-xs font-medium text-foreground-muted uppercase tracking-wider">
              Uncertain ({uncertainRows.length}) — pick a match or add as new
            </p>
          </div>
          <ul className="divide-y divide-border">
            {uncertainRows.map((r) => {
              const idx = rows.indexOf(r)
              return (
                <li key={r.receiptItemId} className="px-3 py-3">
                  <div className="flex items-baseline justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <p className="text-sm text-foreground">{r.description}</p>
                      <p className="text-[11px] text-foreground-soft">
                        per {r.unit} · parsed at ${r.parsedPrice.toFixed(2)}
                        {r.receiptSku ? (
                          <>
                            {" · "}
                            <span className="font-medium text-foreground-muted">
                              SKU {r.receiptSku}
                            </span>
                          </>
                        ) : (
                          <>
                            {" · "}
                            <WarningChip>SKU incomplete</WarningChip>
                          </>
                        )}
                      </p>
                    </div>
                    <select
                      value={r.resolution}
                      onChange={(e) =>
                        patchRow<UncertainState>(idx, {
                          resolution: e.target.value as UncertainState["resolution"],
                        })
                      }
                      className="text-sm border border-border rounded px-2 py-1 bg-surface"
                    >
                      <option value="skip">Skip</option>
                      <option value="match">Update existing</option>
                      <option value="new">Add as new</option>
                    </select>
                  </div>
                  {r.resolution === "match" && (
                    <div className="mt-2 ml-1">
                      <select
                        value={r.pickedCatalogItemId ?? ""}
                        onChange={(e) =>
                          patchRow<UncertainState>(idx, {
                            pickedCatalogItemId: e.target.value || null,
                          })
                        }
                        className="w-full text-sm border border-border rounded px-2 py-1.5 bg-surface"
                      >
                        {r.candidates.map((c) => (
                          <option key={c.catalogItemId} value={c.catalogItemId}>
                            {c.description} ({c.unit}) · score{" "}
                            {(c.score * 100).toFixed(0)}%
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  {r.resolution === "new" && (
                    <div className="mt-2 ml-1 grid grid-cols-2 gap-2">
                      <select
                        value={r.newTrade}
                        onChange={(e) =>
                          patchRow<UncertainState>(idx, { newTrade: e.target.value })
                        }
                        className="text-sm border border-border rounded px-2 py-1.5 bg-surface"
                      >
                        {TRADES.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        value={r.newPrice}
                        onChange={(e) =>
                          patchRow<UncertainState>(idx, {
                            newPrice: Number(e.target.value) || 0,
                          })
                        }
                        className="text-sm tabular-nums border border-border rounded px-2 py-1.5 bg-surface"
                      />
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {/* NEW ITEMS */}
      {newRows.length > 0 && (
        <section
          id="new-items"
          className="bg-surface border border-border rounded-lg overflow-hidden"
        >
          <div className="px-4 py-2 bg-surface-muted border-b border-border">
            <p className="text-xs font-medium text-foreground-muted uppercase tracking-wider">
              New catalog items ({newRows.length})
            </p>
          </div>
          <ul className="divide-y divide-border">
            {newRows.map((r) => {
              const idx = rows.indexOf(r)
              return (
                <li key={r.receiptItemId} className="px-3 py-3">
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={r.apply}
                      onChange={(e) =>
                        patchRow<NewState>(idx, { apply: e.target.checked })
                      }
                      className="mt-2 accent-accent"
                    />
                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                      <input
                        value={r.description}
                        onChange={(e) =>
                          patchRow<NewState>(idx, { description: e.target.value })
                        }
                        className="sm:col-span-5 text-sm border border-border rounded px-2 py-1.5 bg-surface focus:outline-none focus:ring-1 focus:ring-accent"
                      />
                      <input
                        value={r.unit}
                        onChange={(e) =>
                          patchRow<NewState>(idx, { unit: e.target.value })
                        }
                        className="sm:col-span-2 text-sm border border-border rounded px-2 py-1.5 bg-surface text-center"
                      />
                      <select
                        value={r.trade}
                        onChange={(e) =>
                          patchRow<NewState>(idx, { trade: e.target.value })
                        }
                        className="sm:col-span-3 text-sm border border-border rounded px-2 py-1.5 bg-surface"
                      >
                        {TRADES.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        value={r.price}
                        onChange={(e) =>
                          patchRow<NewState>(idx, {
                            price: Number(e.target.value) || 0,
                          })
                        }
                        className="sm:col-span-2 text-sm tabular-nums border border-border rounded px-2 py-1.5 bg-surface"
                      />
                      <div className="sm:col-span-12 flex items-center gap-2">
                        <label
                          className="text-[10px] text-foreground-soft uppercase tracking-wider"
                          title="Home Depot SKU. Lets the cart-builder jump straight to this item's PDP."
                        >
                          HD SKU
                        </label>
                        <input
                          value={r.hdSku}
                          onChange={(e) =>
                            patchRow<NewState>(idx, { hdSku: e.target.value })
                          }
                          placeholder={
                            r.hdSku
                              ? ""
                              : "SKU not parsed — leave blank or type manually"
                          }
                          className={`flex-1 text-xs tabular-nums border rounded px-2 py-1 bg-surface focus:outline-none focus:ring-1 focus:ring-accent ${
                            r.hdSku.trim()
                              ? "border-border text-foreground"
                              : "border-amber-300 bg-amber-50 text-amber-900 placeholder:text-amber-700/70"
                          }`}
                        />
                        {!r.hdSku.trim() && (
                          <WarningChip>SKU incomplete</WarningChip>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {/* FOOTER */}
      <div className="sticky bottom-0 -mx-4 sm:mx-0 px-4 py-3 bg-surface border-t border-border flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-foreground-muted">
          Will update <strong className="text-foreground">{summary.updates}</strong>{" "}
          price{summary.updates === 1 ? "" : "s"}, add{" "}
          <strong className="text-foreground">{summary.creates}</strong> new item
          {summary.creates === 1 ? "" : "s"}, skip{" "}
          <strong className="text-foreground">{skipped}</strong>.
        </p>
        <div className="flex items-center gap-2">
          {error && (
            <span aria-live="polite" className="text-xs text-danger">
              {error}
            </span>
          )}
          {success && (
            <span aria-live="polite" className="text-xs text-success">
              Updated {success.updated}, added {success.created}.
            </span>
          )}
          <button
            type="button"
            disabled={pending || summary.updates + summary.creates === 0}
            onClick={submit}
            className="px-4 py-1.5 bg-accent text-white rounded text-sm font-medium hover:bg-accent-hover disabled:opacity-50"
          >
            {pending ? "Applying…" : "Apply decisions"}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Compact SKU status line under each likely-match row. Surfaces:
 *   - SKUs in sync: "SKU 100075069 ✓"
 *   - Catalog blank, receipt has one: checkbox to write through (default ON)
 *   - SKUs differ: amber conflict warning + opt-in checkbox to overwrite
 *   - Receipt SKU missing: "SKU incomplete" amber chip
 *   - Both missing: nothing — don't add visual noise
 */
function SkuRow({
  receiptSku,
  catalogSku,
  applySku,
  onToggleApply,
}: {
  receiptSku: string | null
  catalogSku: string | null
  applySku: boolean
  onToggleApply: (v: boolean) => void
}) {
  // Both empty — nothing to show.
  if (!receiptSku && !catalogSku) {
    return null
  }

  // Receipt couldn't read it but catalog has one already. Just show.
  if (!receiptSku && catalogSku) {
    return (
      <div className="text-[10px] text-foreground-soft mt-0.5">
        Catalog SKU: {catalogSku}
      </div>
    )
  }

  // Receipt has one, catalog doesn't — quiet win, default-applied.
  if (receiptSku && !catalogSku) {
    return (
      <label className="flex items-center gap-1.5 text-[10px] text-foreground-soft mt-0.5 cursor-pointer">
        <input
          type="checkbox"
          checked={applySku}
          onChange={(e) => onToggleApply(e.target.checked)}
          className="accent-accent w-3 h-3"
        />
        <span>
          Save SKU <strong className="text-foreground">{receiptSku}</strong> from receipt
        </span>
      </label>
    )
  }

  // Both present and equal → confirm.
  if (receiptSku === catalogSku) {
    return (
      <div className="text-[10px] text-success mt-0.5">
        SKU {receiptSku} ✓ matches catalog
      </div>
    )
  }

  // Conflict path — different SKUs.
  return (
    <div className="mt-0.5 flex items-center gap-2 text-[10px] bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
      <span className="text-amber-900">
        SKU conflict — catalog: <strong>{catalogSku}</strong>, receipt:{" "}
        <strong>{receiptSku}</strong>
      </span>
      <label className="flex items-center gap-1 cursor-pointer text-amber-900">
        <input
          type="checkbox"
          checked={applySku}
          onChange={(e) => onToggleApply(e.target.checked)}
          className="accent-accent w-3 h-3"
        />
        Overwrite
      </label>
    </div>
  )
}
