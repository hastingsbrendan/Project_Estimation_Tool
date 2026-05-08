"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"

/**
 * Fires the Claude vision parse on first render of a freshly uploaded
 * receipt — i.e. parseStatus === "pending" with no items yet. We do this
 * client-side instead of in the upload action so each step has its own
 * 10s Vercel function budget; a 25s parse can't blow up the upload.
 */
export function AutoParseTrigger({
  receiptId,
  shouldRun,
  action,
}: {
  receiptId: string
  shouldRun: boolean
  action: (id: string) => Promise<{ ok: boolean; error?: string }>
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const fired = useRef(false)
  const router = useRouter()

  useEffect(() => {
    if (!shouldRun || fired.current) return
    fired.current = true
    startTransition(async () => {
      const r = await action(receiptId)
      if (!r.ok) {
        setError(r.error ?? "Parse failed")
        return
      }
      // Pull in the freshly-saved fields + items.
      router.refresh()
    })
  }, [shouldRun, receiptId, action, router])

  if (!shouldRun && !pending && !error) return null

  if (error) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded p-3 text-sm text-amber-900">
        <strong>Couldn&rsquo;t auto-parse:</strong> {error} You can still enter items manually below,
        or click &ldquo;Re-parse with AI&rdquo; to try again.
      </div>
    )
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="bg-accent-soft border border-accent/30 rounded p-3 text-sm text-foreground flex items-center gap-2"
    >
      <span className="inline-block w-3 h-3 rounded-full bg-accent animate-pulse" />
      Reading receipt with AI… this usually takes 10–25 seconds.
    </div>
  )
}
