"use client"

import { useState, useTransition } from "react"

/**
 * Reveal-to-edit pattern for the encrypted tax ID. Default state shows a
 * masked stub (••••1234) and a "Change" button. Clicking Change swaps in
 * a text input + Save / Cancel. On Save, the action encrypts the new
 * value server-side and stores last4 plain.
 *
 * If SUBCONTRACTOR_PII_KEY isn't configured, the parent page passes
 * `lockedReason` and we render a disabled state with the explanation.
 */
export function TaxIdField({
  last4,
  hasValue,
  lockedReason,
  setAction,
  unsetAction,
}: {
  last4: string | null
  hasValue: boolean
  lockedReason: string | null
  setAction: (formData: FormData) => Promise<{ ok: boolean; error?: string }>
  unsetAction: () => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState("")
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()

  if (lockedReason) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-xs text-amber-900">
        <strong>Tax ID locked.</strong> {lockedReason}
      </div>
    )
  }

  if (editing) {
    return (
      <form
        action={(fd) =>
          startTransition(async () => {
            setError("")
            const r = await setAction(fd)
            if (!r.ok) {
              setError(r.error ?? "Could not save")
              return
            }
            setEditing(false)
            setValue("")
          })
        }
        className="space-y-2"
      >
        <input
          name="taxId"
          inputMode="numeric"
          autoComplete="off"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="9 digits — SSN or EIN"
          required
          className="w-full text-sm font-mono text-foreground border border-border rounded px-3 py-2 bg-surface focus:outline-none focus:ring-2 focus:ring-accent tabular-nums"
        />
        <p className="text-[11px] text-foreground-soft">
          Stored encrypted (AES-256-GCM). Only last 4 digits ever shown without
          a deliberate decrypt — used for 1099 generation.
        </p>
        {error && (
          <p className="text-xs text-danger" aria-live="polite">
            {error}
          </p>
        )}
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={pending}
            className="px-3 py-1.5 bg-accent text-white rounded text-xs font-medium hover:bg-accent-hover disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false)
              setValue("")
              setError("")
            }}
            disabled={pending}
            className="px-3 py-1.5 text-xs border border-border rounded text-foreground-muted hover:bg-surface-muted disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </form>
    )
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="font-mono text-sm tabular-nums text-foreground">
        {hasValue ? `••••• ${last4 ?? "????"}` : "Not set"}
      </span>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-xs text-accent hover:underline"
      >
        {hasValue ? "Change" : "Add tax ID"}
      </button>
      {hasValue && (
        <button
          type="button"
          onClick={() =>
            startTransition(async () => {
              await unsetAction()
            })
          }
          disabled={pending}
          className="text-xs text-foreground-soft hover:text-danger disabled:opacity-50"
        >
          Remove
        </button>
      )}
    </div>
  )
}
