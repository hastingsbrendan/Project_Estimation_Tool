"use client"

import { useState, useTransition } from "react"

type SpecialtyOption = { id: string; label: string }

export function SpecialtyChips({
  current,
  options,
  addAction,
  removeAction,
}: {
  current: { id: string; label: string }[]
  options: SpecialtyOption[]
  addAction: (formData: FormData) => Promise<void>
  removeAction: (specialtyId: string) => Promise<void>
}) {
  const [picking, setPicking] = useState(false)
  const [pending, startTransition] = useTransition()
  const currentIds = new Set(current.map((c) => c.id))
  const available = options.filter((o) => !currentIds.has(o.id))

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5 items-center">
        {current.length === 0 && (
          <span className="text-xs text-foreground-soft italic">
            No specialties yet
          </span>
        )}
        {current.map((c) => (
          <span
            key={c.id}
            className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-accent-soft text-foreground rounded-full"
          >
            {c.label}
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await removeAction(c.id)
                })
              }
              className="text-foreground-soft hover:text-danger disabled:opacity-50"
              aria-label={`Remove ${c.label}`}
            >
              ✕
            </button>
          </span>
        ))}
        {!picking && available.length > 0 && (
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="text-xs text-foreground-muted hover:text-foreground border border-dashed border-border rounded-full px-2 py-0.5"
          >
            + add
          </button>
        )}
      </div>

      {picking && (
        <form
          action={(fd) =>
            startTransition(async () => {
              await addAction(fd)
              setPicking(false)
            })
          }
          className="flex items-center gap-2"
        >
          <select
            name="specialtyId"
            defaultValue=""
            required
            className="text-sm border border-border rounded px-2 py-1 bg-surface focus:outline-none focus:ring-1 focus:ring-accent"
          >
            <option value="" disabled>
              Pick a specialty…
            </option>
            {available.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={pending}
            className="text-xs px-2 py-1 bg-accent text-white rounded hover:bg-accent-hover disabled:opacity-50"
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => setPicking(false)}
            className="text-xs text-foreground-soft hover:text-foreground"
          >
            Cancel
          </button>
        </form>
      )}
    </div>
  )
}
