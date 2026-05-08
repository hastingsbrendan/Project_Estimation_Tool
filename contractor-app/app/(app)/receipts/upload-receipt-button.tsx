"use client"

import { useRouter } from "next/navigation"
import { useRef, useState, useTransition } from "react"

export function UploadReceiptButton({
  projects,
  uploadAction,
  primary,
}: {
  projects: Array<{ id: string; name: string }>
  uploadAction: (
    formData: FormData,
  ) => Promise<{ ok: boolean; error?: string; receiptId?: string }>
  primary?: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string>("")
  const fileRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)

  const cls = primary
    ? "px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors"
    : "px-3 py-1.5 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent-hover transition-colors"

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cls}>
        + Upload receipt
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
                <h2 className="text-base font-semibold text-foreground">Upload receipt</h2>
                <p className="text-xs text-foreground-soft mt-0.5">
                  Pick a photo or PDF. We&rsquo;ll try to parse line items with
                  Claude on the next page.
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
              ref={formRef}
              action={(fd) =>
                startTransition(async () => {
                  setError("")
                  const r = await uploadAction(fd)
                  if (!r.ok) {
                    setError(r.error ?? "Upload failed")
                    return
                  }
                  if (r.receiptId) {
                    setOpen(false)
                    router.push(`/receipts/${r.receiptId}`)
                  }
                })
              }
              className="space-y-3"
            >
              <div>
                <label className="block text-xs font-medium text-foreground-muted mb-1">
                  Receipt photo or PDF
                </label>
                <input
                  ref={fileRef}
                  name="file"
                  type="file"
                  // capture="environment" hints camera-first on mobile while
                  // still allowing the picker to fall back to files (incl. PDFs)
                  // on desktop and on iOS via the "Photo Library / Choose File"
                  // option in the native sheet.
                  accept="image/*,application/pdf,.pdf"
                  capture="environment"
                  required
                  onChange={(e) => {
                    const f = e.currentTarget.files?.[0]
                    if (!f) return
                    if (f.size > 12 * 1024 * 1024) {
                      setError("File is larger than 12 MB. Pick something smaller.")
                      e.currentTarget.value = ""
                    } else {
                      setError("")
                    }
                  }}
                  className="block w-full text-sm border border-border rounded px-2 py-2 bg-surface focus:outline-none focus:ring-2 focus:ring-accent file:mr-2 file:px-3 file:py-1.5 file:bg-accent-soft file:border-0 file:rounded file:text-foreground file:text-xs"
                />
                <p className="text-[10px] text-foreground-soft mt-1">
                  JPG / PNG / WebP / PDF up to 12 MB. Camera opens on iOS / Android.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground-muted mb-1">
                  Assign to project (optional)
                </label>
                <select
                  name="projectId"
                  defaultValue=""
                  className="block w-full text-sm text-foreground border border-border rounded px-2 py-1.5 bg-surface focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  <option value="">— Unassigned —</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

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
                  {pending ? "Uploading…" : "Upload"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
