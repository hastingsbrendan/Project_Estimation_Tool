"use client"

import { useRef, useState, useTransition } from "react"
import { ConfirmSubmitButton } from "../confirm-submit-button"

export function LogoUploader({
  logoUrl,
  uploadAction,
  removeAction,
}: {
  logoUrl: string | null
  uploadAction: (formData: FormData) => Promise<{ ok: boolean; error?: string }>
  removeAction: () => Promise<void>
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()

  return (
    <div className="flex items-center gap-4 flex-wrap">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt="Business logo"
          className="h-16 w-16 object-contain bg-surface-muted border border-border rounded-lg p-1"
        />
      ) : (
        <div className="h-16 w-16 bg-surface-muted border border-dashed border-border rounded-lg flex items-center justify-center text-xl text-foreground-soft">
          🔨
        </div>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => fileRef.current?.click()}
          className="px-3 py-1.5 bg-surface border border-border rounded text-xs font-medium text-foreground hover:bg-accent-soft disabled:opacity-50"
        >
          {pending ? "Uploading…" : logoUrl ? "Replace logo" : "+ Upload logo"}
        </button>
        {logoUrl && (
          <form action={removeAction}>
            <ConfirmSubmitButton
              confirmText="Remove the logo? PDFs fall back to text-only branding."
              className="px-3 py-1.5 text-xs text-foreground-soft hover:text-danger"
            >
              Remove
            </ConfirmSubmitButton>
          </form>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (!f) return
          setError("")
          const fd = new FormData()
          fd.append("logo", f)
          startTransition(async () => {
            const r = await uploadAction(fd)
            if (!r.ok) setError(r.error ?? "Upload failed")
            if (fileRef.current) fileRef.current.value = ""
          })
        }}
      />
      {error && <p className="text-xs text-danger w-full">{error}</p>}
    </div>
  )
}
