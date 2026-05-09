"use client"

import { useState, useTransition } from "react"

const METHODS = [
  { value: "check", label: "Check" },
  { value: "ach", label: "ACH" },
  { value: "cash", label: "Cash" },
  { value: "other", label: "Other" },
]

export function LogPaymentForm({
  projects,
  defaultProjectId,
  action,
}: {
  projects: { id: string; name: string }[]
  defaultProjectId?: string | null
  action: (formData: FormData) => Promise<{ ok: boolean; error?: string }>
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState("")
  const [open, setOpen] = useState(false)
  const today = new Date().toISOString().slice(0, 10)

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="px-3 py-1.5 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent-hover"
      >
        + Log payment
      </button>
    )
  }

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          setError("")
          const r = await action(fd)
          if (!r.ok) {
            setError(r.error ?? "Could not save")
            return
          }
          setOpen(false)
        })
      }
      className="bg-surface border border-border rounded-lg p-4 space-y-3"
    >
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-foreground-muted mb-1">
            Amount *
          </label>
          <input
            name="amount"
            type="number"
            step="0.01"
            min={0}
            required
            placeholder="0.00"
            className="w-full text-sm border border-border rounded px-3 py-2 bg-surface focus:outline-none focus:ring-2 focus:ring-accent tabular-nums"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-foreground-muted mb-1">
            Paid on *
          </label>
          <input
            name="paidAt"
            type="date"
            defaultValue={today}
            required
            className="w-full text-sm border border-border rounded px-3 py-2 bg-surface focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-foreground-muted mb-1">
            Method
          </label>
          <select
            name="method"
            defaultValue="check"
            className="w-full text-sm border border-border rounded px-3 py-2 bg-surface focus:outline-none focus:ring-2 focus:ring-accent"
          >
            {METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-foreground-muted mb-1">
            Reference
          </label>
          <input
            name="reference"
            placeholder="Check #, Zelle memo…"
            className="w-full text-sm border border-border rounded px-3 py-2 bg-surface focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-foreground-muted mb-1">
          Project (optional)
        </label>
        <select
          name="projectId"
          defaultValue={defaultProjectId ?? ""}
          className="w-full text-sm border border-border rounded px-3 py-2 bg-surface focus:outline-none focus:ring-2 focus:ring-accent"
        >
          <option value="">— Unassigned —</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-foreground-muted mb-1">
          Notes
        </label>
        <textarea
          name="notes"
          rows={2}
          className="w-full text-sm border border-border rounded px-3 py-2 bg-surface focus:outline-none focus:ring-2 focus:ring-accent resize-y"
        />
      </div>

      {error && (
        <p
          aria-live="polite"
          className="text-sm text-danger bg-red-50 border border-red-200 rounded px-2 py-1.5"
        >
          {error}
        </p>
      )}

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => {
            setOpen(false)
            setError("")
          }}
          disabled={pending}
          className="px-3 py-1.5 text-sm border border-border rounded text-foreground-muted hover:bg-surface-muted disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="px-4 py-1.5 bg-accent text-white rounded text-sm font-medium hover:bg-accent-hover disabled:opacity-50"
        >
          {pending ? "Saving…" : "Log payment"}
        </button>
      </div>
    </form>
  )
}
