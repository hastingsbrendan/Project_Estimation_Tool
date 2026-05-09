"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

/**
 * Inline banner shown on the project detail page when the user has zero
 * catalog items. New accounts auto-seed via Auth.js events.createUser, so
 * this banner only appears for existing users from before that change OR
 * for someone who wiped their catalog.
 *
 * Click "Update dummy catalog" → server action seeds the 300 starter
 * items, page revalidates, the banner disappears (catalog is no longer
 * empty), and the catalog typeahead in line-item pickers below it lights
 * up immediately.
 */
export function CatalogEmptyBanner({
  loadAction,
}: {
  loadAction: () => Promise<void>
}) {
  const [pending, startTransition] = useTransition()
  const [done, setDone] = useState(false)
  const router = useRouter()

  return (
    <div className="bg-accent-soft border border-accent/30 rounded-lg p-4 flex items-start justify-between gap-3 flex-wrap">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground">
          Your catalog is empty
        </p>
        <p className="text-xs text-foreground-muted mt-1">
          Without a catalog, the line-item picker can&rsquo;t autocomplete. Load
          ~300 starter items across 6 trades — you can edit any of them later
          to match your real prices.
        </p>
      </div>
      <button
        type="button"
        disabled={pending || done}
        onClick={() =>
          startTransition(async () => {
            await loadAction()
            setDone(true)
            router.refresh()
          })
        }
        className="px-3 py-2 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent-hover disabled:opacity-50 whitespace-nowrap"
      >
        {pending ? "Loading…" : done ? "Loaded ✓" : "Update dummy catalog"}
      </button>
    </div>
  )
}
