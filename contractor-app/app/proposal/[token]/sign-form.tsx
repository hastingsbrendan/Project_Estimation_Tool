"use client"

import { useState, useTransition } from "react"

export function SignForm({
  token,
  action,
}: {
  token: string
  action: (
    token: string,
    formData: FormData,
  ) => Promise<{ ok: boolean; error?: string; alreadySigned?: boolean }>
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string>("")

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          setError("")
          const r = await action(token, fd)
          if (!r.ok) {
            setError(r.error ?? "Could not record acceptance")
            return
          }
          // Re-render through revalidation; the page will swap to the signed view.
        })
      }
      className="space-y-4"
    >
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-foreground mb-1">
          Type your full name <span className="text-danger">*</span>
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          autoComplete="name"
          placeholder="e.g. Jane Smith"
          className="w-full text-sm text-foreground border border-border rounded-md px-3 py-2 bg-surface focus:outline-none focus:ring-2 focus:ring-accent"
        />
        <p className="text-xs text-foreground-soft mt-1">
          Typing your name and accepting below has the same legal effect as a written
          signature.
        </p>
      </div>

      <label className="flex items-start gap-2 text-sm text-foreground cursor-pointer select-none">
        <input
          type="checkbox"
          name="consent"
          required
          className="mt-1 accent-accent shrink-0"
        />
        <span>
          I have reviewed the proposal above and accept the scope of work, total
          price, and payment schedule. I understand any changes to the scope require
          a written change order signed by both parties.
        </span>
      </label>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="px-4 py-2.5 bg-accent text-white rounded-lg text-sm font-semibold hover:bg-accent-hover disabled:opacity-50 transition-colors"
        >
          {pending ? "Recording…" : "Sign and accept"}
        </button>
        {error && (
          <span aria-live="polite" className="text-sm text-danger">
            {error}
          </span>
        )}
      </div>
    </form>
  )
}
