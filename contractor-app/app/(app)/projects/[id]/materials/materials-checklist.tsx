"use client"

import { useEffect, useMemo, useState } from "react"
import { formatCurrency } from "@/lib/calc"

/**
 * Truck-day checklist + share. The materials list used to be a
 * read-only table — useless mid-store-trip. This client component adds:
 *
 *  - A check-off state per row ("got it" / "already have it"), persisted
 *    in localStorage keyed by project, so the list survives the store
 *    run on the contractor's phone. Deliberately NOT in the DB: the
 *    checklist is ephemeral shopping state, not project data, and
 *    localStorage works offline in a concrete-walled store aisle.
 *  - "Share list" — navigator.share on phones (→ SMS/notes), clipboard
 *    fallback on desktop. Includes SKUs so anyone can find the items.
 */

export type ChecklistRow = {
  description: string
  unit: string
  quantity: number
  estUnitPrice: number
  estSubtotal: number
  hdSku: string | null
}

function storageKey(projectId: string) {
  return `truck-list:${projectId}`
}

function rowKey(r: ChecklistRow) {
  return `${r.description.toLowerCase()}::${r.unit.toLowerCase()}`
}

export function MaterialsChecklist({
  projectId,
  projectName,
  rows,
  total,
}: {
  projectId: string
  projectName: string
  rows: ChecklistRow[]
  total: number
}) {
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [shareState, setShareState] = useState<"idle" | "copied">("idle")

  // Hydrate from localStorage after mount (SSR-safe).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey(projectId))
      if (raw) setChecked(JSON.parse(raw))
    } catch {
      // corrupted state — start fresh
    }
  }, [projectId])

  function toggle(key: string) {
    setChecked((prev) => {
      const next = { ...prev, [key]: !prev[key] }
      try {
        localStorage.setItem(storageKey(projectId), JSON.stringify(next))
      } catch {
        // storage full/blocked — checklist still works in-memory
      }
      return next
    })
  }

  const remaining = useMemo(
    () => rows.filter((r) => !checked[rowKey(r)]).length,
    [rows, checked],
  )

  async function share() {
    const lines = rows.map(
      (r) =>
        `${checked[rowKey(r)] ? "✓ " : "• "}${r.quantity} ${r.unit} — ${r.description}${
          r.hdSku ? ` (HD SKU ${r.hdSku})` : ""
        }`,
    )
    const text = `Materials — ${projectName}\n\n${lines.join("\n")}\n\nEst. total: ${formatCurrency(total)}`
    if (navigator.share) {
      try {
        await navigator.share({ title: `Materials — ${projectName}`, text })
        return
      } catch {
        // user cancelled or share failed — fall through to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(text)
      setShareState("copied")
      setTimeout(() => setShareState("idle"), 2500)
    } catch {
      // clipboard blocked — nothing else to fall back to
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-foreground-soft">
          {remaining === 0 && rows.length > 0
            ? "✓ Everything checked off."
            : `${remaining} of ${rows.length} item${rows.length === 1 ? "" : "s"} left to buy. Check-offs save on this device.`}
        </p>
        <button
          type="button"
          onClick={share}
          className="text-xs px-3 py-1.5 bg-surface border border-border rounded-md font-medium text-foreground-muted hover:bg-surface-muted"
        >
          {shareState === "copied" ? "✓ Copied" : "📤 Share list"}
        </button>
      </div>

      <div className="bg-surface border border-border rounded-lg overflow-hidden">
        <div className="hidden sm:grid grid-cols-12 gap-2 px-4 py-2 bg-surface-muted text-[10px] font-medium uppercase tracking-wider text-foreground-soft">
          <div className="col-span-1"></div>
          <div className="col-span-4">Description</div>
          <div className="col-span-1">HD SKU</div>
          <div className="col-span-1 text-right">Qty</div>
          <div className="col-span-1">Unit</div>
          <div className="col-span-2 text-right">Est $/unit</div>
          <div className="col-span-2 text-right">Subtotal</div>
        </div>
        <div className="divide-y divide-border">
          {rows.map((r) => {
            const key = rowKey(r)
            const done = !!checked[key]
            return (
              <label
                key={key}
                className={`grid grid-cols-12 gap-2 px-4 py-2.5 text-sm items-baseline cursor-pointer hover:bg-surface-muted/40 ${
                  done ? "opacity-50" : ""
                }`}
              >
                <div className="col-span-1">
                  <input
                    type="checkbox"
                    checked={done}
                    onChange={() => toggle(key)}
                    className="accent-accent w-4 h-4"
                  />
                </div>
                <div
                  className={`col-span-11 sm:col-span-4 text-foreground ${done ? "line-through" : ""}`}
                >
                  {r.description}
                </div>
                <div className="col-span-6 sm:col-span-1 text-xs tabular-nums">
                  {r.hdSku ? (
                    <a
                      href={`https://www.homedepot.com/s/${encodeURIComponent(r.hdSku)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {r.hdSku}
                    </a>
                  ) : (
                    <span className="text-foreground-soft">—</span>
                  )}
                </div>
                <div className="col-span-2 sm:col-span-1 text-right tabular-nums text-foreground">
                  {r.quantity}
                </div>
                <div className="col-span-2 sm:col-span-1 text-foreground-muted">{r.unit}</div>
                <div className="col-span-2 sm:col-span-2 text-right tabular-nums text-foreground-muted">
                  {formatCurrency(r.estUnitPrice)}
                </div>
                <div className="col-span-12 sm:col-span-2 text-right tabular-nums font-medium text-foreground">
                  {formatCurrency(r.estSubtotal)}
                </div>
              </label>
            )
          })}
        </div>
        <div className="border-t-2 border-foreground px-4 py-3 flex items-center justify-end gap-3">
          <span className="text-sm font-semibold text-foreground">Estimated total:</span>
          <span className="text-lg font-bold text-accent tabular-nums">
            {formatCurrency(total)}
          </span>
        </div>
      </div>
    </div>
  )
}
