"use client"

import { useState, useTransition } from "react"

export type SuggestedPreset = {
  presetId: string
  materialId: string
  materialDescription: string
  materialUnit: string
  materialUnitPrice: number
  defaultQty: number
}

/**
 * Inline panel rendered immediately below a freshly-added service line item
 * when that service has catalog presets. The user can uncheck individual
 * suggestions, edit qtys, then bulk-insert them as material line items in
 * one server roundtrip. Or click Skip to dismiss.
 */
export function SuggestedMaterialsPanel({
  serviceDescription,
  presets,
  onApply,
  onDismiss,
}: {
  serviceDescription: string
  presets: SuggestedPreset[]
  onApply: (
    picks: Array<{ presetId: string; quantity: number }>,
  ) => Promise<{ added: number }>
  onDismiss: () => void
}) {
  // Per-row state: checked + qty
  const [rows, setRows] = useState(
    presets.map((p) => ({
      presetId: p.presetId,
      checked: true,
      qty: p.defaultQty,
    })),
  )
  const [isPending, startTransition] = useTransition()

  const presetById = new Map(presets.map((p) => [p.presetId, p]))
  const checkedCount = rows.filter((r) => r.checked).length

  const apply = () => {
    const picks = rows
      .filter((r) => r.checked)
      .map((r) => ({ presetId: r.presetId, quantity: Number(r.qty) }))
    if (picks.length === 0) {
      onDismiss()
      return
    }
    startTransition(async () => {
      try {
        await onApply(picks)
      } finally {
        onDismiss()
      }
    })
  }

  return (
    <div className="bg-accent-soft/40 border border-accent border-dashed rounded-lg mx-2 my-2 p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-foreground">
          💡 Suggested materials for{" "}
          <span className="italic">{serviceDescription}</span>
        </p>
        <button
          type="button"
          onClick={onDismiss}
          className="text-xs text-foreground-soft hover:text-foreground"
          aria-label="Dismiss suggestions"
        >
          ✕
        </button>
      </div>

      <ul className="space-y-1 mb-3">
        {rows.map((r) => {
          const p = presetById.get(r.presetId)
          if (!p) return null
          return (
            <li
              key={r.presetId}
              className="grid grid-cols-12 gap-2 items-center text-sm bg-surface border border-border rounded px-2 py-1.5"
            >
              <label className="col-span-12 sm:col-span-7 flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={r.checked}
                  onChange={(e) => {
                    const checked = e.target.checked
                    setRows((rs) =>
                      rs.map((x) =>
                        x.presetId === r.presetId ? { ...x, checked } : x,
                      ),
                    )
                  }}
                  className="accent-accent"
                />
                <span className="truncate text-foreground">
                  {p.materialDescription}
                  <span className="text-[10px] text-foreground-soft ml-2 tabular-nums">
                    ${p.materialUnitPrice.toFixed(2)}/{p.materialUnit}
                  </span>
                </span>
              </label>
              <div className="col-span-12 sm:col-span-5 flex items-center gap-2 justify-end">
                <label className="text-[10px] text-foreground-soft">Qty:</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={r.qty}
                  onChange={(e) => {
                    const qty = Number(e.target.value)
                    setRows((rs) =>
                      rs.map((x) =>
                        x.presetId === r.presetId ? { ...x, qty } : x,
                      ),
                    )
                  }}
                  disabled={!r.checked}
                  className="w-20 border border-border rounded px-1.5 py-0.5 bg-surface text-xs tabular-nums text-foreground focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
                />
                <span className="text-[10px] text-foreground-soft min-w-8">
                  {p.materialUnit}
                </span>
              </div>
            </li>
          )
        })}
      </ul>

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onDismiss}
          disabled={isPending}
          className="px-3 py-1.5 text-xs border border-border rounded text-foreground-muted hover:bg-surface hover:text-foreground disabled:opacity-50"
        >
          Skip
        </button>
        <button
          type="button"
          onClick={apply}
          disabled={isPending || checkedCount === 0}
          className="px-3 py-1.5 text-xs bg-accent text-white rounded font-medium hover:bg-accent-hover disabled:opacity-50"
        >
          {isPending
            ? "Adding…"
            : `Add ${checkedCount} material${checkedCount === 1 ? "" : "s"}`}
        </button>
      </div>
    </div>
  )
}
