"use client"

import { useState, useTransition } from "react"

export function RefreshPricesButton({
  refreshableCount,
  totalLinked,
  action,
}: {
  refreshableCount: number
  totalLinked: number
  action: () => Promise<{ updated: number }>
}) {
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<string>("")

  if (totalLinked === 0) {
    return (
      <p className="text-xs text-foreground-soft italic">
        Pick items from the catalog dropdown to enable price refresh on this project.
      </p>
    )
  }

  if (refreshableCount === 0) {
    return (
      <p className="text-xs text-foreground-soft">
        ✓ All {totalLinked} catalog-linked item{totalLinked === 1 ? "" : "s"} match the
        current catalog.
      </p>
    )
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            const r = await action()
            setResult(
              r.updated === 0
                ? "Already up to date."
                : `Updated ${r.updated} line item${r.updated === 1 ? "" : "s"}.`,
            )
            setTimeout(() => setResult(""), 4000)
          })
        }
        className="px-3 py-1.5 text-xs bg-accent-soft border border-accent text-accent-hover rounded-md font-medium hover:bg-accent-soft-hover disabled:opacity-50"
      >
        {isPending
          ? "Refreshing…"
          : `↻ Refresh ${refreshableCount} price${refreshableCount === 1 ? "" : "s"} from catalog`}
      </button>
      {result && (
        <span aria-live="polite" className="text-xs text-success">
          {result}
        </span>
      )}
    </div>
  )
}
