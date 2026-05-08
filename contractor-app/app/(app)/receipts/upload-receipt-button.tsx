"use client"

import { useRouter } from "next/navigation"
import { useRef, useState, useTransition } from "react"
import { compressImageIfNeeded } from "@/lib/compress-image"

const HARD_LIMIT_BYTES = 20 * 1024 * 1024 // matches server's MAX_BYTES

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

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
  const [busy, setBusy] = useState<"compressing" | "uploading" | null>(null)
  const [error, setError] = useState<string>("")
  const [picked, setPicked] = useState<{
    file: File
    originalSize: number
    compressedSize: number | null
  } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)

  const cls = primary
    ? "px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors"
    : "px-3 py-1.5 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent-hover transition-colors"

  function reset() {
    setError("")
    setPicked(null)
    setBusy(null)
    fileRef.current && (fileRef.current.value = "")
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const original = e.currentTarget.files?.[0]
    if (!original) return
    setError("")
    setBusy("compressing")
    try {
      const compressed = await compressImageIfNeeded(original)
      const finalFile = compressed
      if (finalFile.size > HARD_LIMIT_BYTES) {
        setError(
          `File is ${formatBytes(finalFile.size)} (max 20 MB). Try a smaller picture or PDF.`,
        )
        e.currentTarget.value = ""
        setPicked(null)
        setBusy(null)
        return
      }
      setPicked({
        file: finalFile,
        originalSize: original.size,
        compressedSize: compressed === original ? null : compressed.size,
      })
    } finally {
      setBusy(null)
    }
  }

  async function handleSubmit(formData: FormData) {
    if (!picked) {
      setError("Pick a file first")
      return
    }
    // Replace the raw <input>'s file with our (possibly compressed) one.
    formData.set("file", picked.file, picked.file.name)
    setBusy("uploading")
    const r = await uploadAction(formData)
    setBusy(null)
    if (!r.ok) {
      setError(r.error ?? "Upload failed")
      return
    }
    if (r.receiptId) {
      setOpen(false)
      reset()
      router.push(`/receipts/${r.receiptId}`)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true)
          reset()
        }}
        className={cls}
      >
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
                  Pick a photo from your library, take a new one, or pick a PDF.
                  Big photos get auto-compressed before upload.
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
              action={(fd) => startTransition(() => handleSubmit(fd))}
              className="space-y-3"
            >
              <div>
                <label className="block text-xs font-medium text-foreground-muted mb-1">
                  Receipt photo or PDF
                </label>
                {/*
                 * No `capture` attribute → mobile browsers offer camera AND
                 * photo library in the native picker. capture="environment"
                 * was forcing camera-only on iOS, which Brendan hit on his
                 * phone.
                 */}
                <input
                  ref={fileRef}
                  name="file"
                  type="file"
                  accept="image/*,application/pdf,.pdf"
                  required
                  onChange={handleFileChange}
                  className="block w-full text-sm border border-border rounded px-2 py-2 bg-surface focus:outline-none focus:ring-2 focus:ring-accent file:mr-2 file:px-3 file:py-1.5 file:bg-accent-soft file:border-0 file:rounded file:text-foreground file:text-xs"
                />
                <p className="text-[10px] text-foreground-soft mt-1">
                  JPG / PNG / WebP / PDF. Up to 20 MB after compression.
                </p>
                {picked && (
                  <p className="text-[10px] text-foreground-muted mt-1.5">
                    {picked.compressedSize != null ? (
                      <>
                        Compressed {formatBytes(picked.originalSize)} →{" "}
                        <strong>{formatBytes(picked.compressedSize)}</strong> for upload.
                      </>
                    ) : (
                      <>Ready: {formatBytes(picked.file.size)}</>
                    )}
                  </p>
                )}
                {busy === "compressing" && (
                  <p className="text-[10px] text-foreground-muted mt-1.5">
                    Compressing image…
                  </p>
                )}
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
                  disabled={pending || !picked || busy !== null}
                  className="px-4 py-1.5 bg-accent text-white rounded text-sm font-medium hover:bg-accent-hover disabled:opacity-50"
                >
                  {busy === "uploading" ? "Uploading…" : "Upload"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
