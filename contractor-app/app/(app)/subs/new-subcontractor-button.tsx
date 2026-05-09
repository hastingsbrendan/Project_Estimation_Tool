"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

/**
 * Modal-driven "Add subcontractor" CTA. Lives in a client component so the
 * modal state + router.push to the new sub's detail page can run without
 * an extra round trip. Server action does the actual create + auth check.
 */
export function NewSubcontractorButton({
  action,
  primary,
}: {
  action: (
    formData: FormData,
  ) => Promise<{ ok: boolean; error?: string; subcontractorId?: string }>
  primary?: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState("")

  const cls = primary
    ? "px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors"
    : "px-3 py-1.5 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent-hover transition-colors"

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cls}>
        + Add subcontractor
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => !pending && setOpen(false)}
          className="fixed inset-0 z-30 bg-black/50 flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-surface rounded-lg shadow-xl w-full max-w-md p-5"
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <h2 className="text-base font-semibold text-foreground">
                  Add subcontractor
                </h2>
                <p className="text-xs text-foreground-soft mt-0.5">
                  Just the basics — you can add a tax ID, specialties, and notes
                  on the detail page.
                </p>
              </div>
              <button
                type="button"
                onClick={() => !pending && setOpen(false)}
                className="text-foreground-soft hover:text-foreground"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <form
              action={(fd) =>
                startTransition(async () => {
                  setError("")
                  const r = await action(fd)
                  if (!r.ok) {
                    setError(r.error ?? "Failed")
                    return
                  }
                  setOpen(false)
                  if (r.subcontractorId) router.push(`/subs/${r.subcontractorId}`)
                })
              }
              className="space-y-3"
            >
              <div>
                <label className="block text-xs font-medium text-foreground-muted mb-1">
                  Business / sub name *
                </label>
                <input
                  name="name"
                  required
                  placeholder="e.g. Jose Hernandez Plumbing"
                  className="w-full text-sm border border-border rounded px-3 py-2 bg-surface focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-foreground-muted mb-1">
                    Contact name
                  </label>
                  <input
                    name="contactName"
                    placeholder="Jose"
                    className="w-full text-sm border border-border rounded px-3 py-2 bg-surface focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground-muted mb-1">
                    Phone
                  </label>
                  <input
                    name="phone"
                    type="tel"
                    placeholder="(555) 123-4567"
                    className="w-full text-sm border border-border rounded px-3 py-2 bg-surface focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground-muted mb-1">
                  Email
                </label>
                <input
                  name="email"
                  type="email"
                  placeholder="jose@example.com"
                  className="w-full text-sm border border-border rounded px-3 py-2 bg-surface focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>
              <label className="flex items-start gap-2 text-xs text-foreground-muted cursor-pointer select-none">
                <input
                  type="checkbox"
                  name="isCorporation"
                  value="1"
                  className="mt-0.5 accent-accent shrink-0"
                />
                <span>
                  This is a corporation (S-corp, C-corp, or LLC taxed as a
                  corp). Corporations are exempt from 1099-NEC reporting.
                </span>
              </label>

              {error && (
                <p
                  aria-live="polite"
                  className="text-sm text-danger bg-red-50 border border-red-200 rounded px-2 py-1.5"
                >
                  {error}
                </p>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => !pending && setOpen(false)}
                  disabled={pending}
                  className="px-3 py-1.5 text-sm border border-border rounded text-foreground-muted hover:bg-surface-muted hover:text-foreground disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="px-4 py-1.5 bg-accent text-white rounded text-sm font-medium hover:bg-accent-hover disabled:opacity-50"
                >
                  {pending ? "Saving…" : "Add"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
