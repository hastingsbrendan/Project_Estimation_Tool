"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"

/**
 * Fires the Claude vision parse on first render of a freshly uploaded
 * receipt — i.e. parseStatus === "pending" with no items yet. We do this
 * client-side instead of in the upload action so each step has its own
 * 10s Vercel function budget; a 25s parse can't blow up the upload.
 *
 * Two prior bugs we now avoid:
 * 1. Setting fired=true *before* the action ran meant a thrown action left
 *    the ref permanently stuck and the user couldn't retry without a hard
 *    refresh. We now flip fired only after a successful response, and reset
 *    it on error so a re-mount can try again.
 * 2. No timeout meant a stalled Anthropic call left the spinner spinning
 *    forever. Add a 35s soft timeout that flips to the amber error block.
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
  const inflight = useRef(false)
  const router = useRouter()

  useEffect(() => {
    if (!shouldRun || inflight.current) return
    inflight.current = true

    let timedOut = false
    const timeout = setTimeout(() => {
      timedOut = true
      setError(
        "Taking longer than expected. Click 'Re-parse with AI' to try again or enter items manually below.",
      )
      inflight.current = false
    }, 35_000)

    startTransition(async () => {
      try {
        const r = await action(receiptId)
        clearTimeout(timeout)
        if (timedOut) return // user already saw the timeout message
        if (!r.ok) {
          setError(r.error ?? "Parse failed")
          inflight.current = false
          return
        }
        // Pull in the freshly-saved fields + items.
        router.refresh()
      } catch (e) {
        clearTimeout(timeout)
        if (!timedOut) {
          setError(e instanceof Error ? e.message : "Parse failed")
        }
        inflight.current = false
      }
    })
    return () => clearTimeout(timeout)
  }, [shouldRun, receiptId, action, router])

  if (!shouldRun && !pending && !error) return null

  if (error) {
    return (
      <div
        role="alert"
        className="bg-amber-50 border border-amber-200 rounded p-3 text-sm text-amber-900"
      >
        <strong>Couldn&rsquo;t auto-parse:</strong> {error} You can still enter items
        manually below, or click &ldquo;Re-parse with AI&rdquo; to try again.
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
