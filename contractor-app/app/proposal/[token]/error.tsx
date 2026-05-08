"use client"

import { useEffect } from "react"

/**
 * Customer-facing error boundary for the public proposal page. Customers
 * are NOT logged in and shouldn't see digest hashes or "report this"
 * buttons — they should see a calm message and a way to reach the
 * contractor. The actual error still gets logged server-side via the
 * route's withRouteLogging wrapper.
 */
export default function ProposalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[proposal/error.tsx]", error)
  }, [error])

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-surface border border-border rounded-lg p-6 sm:p-8 text-center">
        <span className="text-3xl block mb-3" aria-hidden="true">⚠️</span>
        <h1 className="text-lg font-bold text-foreground mb-2">
          We couldn&rsquo;t load this proposal
        </h1>
        <p className="text-sm text-foreground-muted mb-5">
          Please try reloading. If this keeps happening, contact the contractor
          who sent you the link — they can check on their end.
        </p>
        <button
          type="button"
          onClick={() => reset()}
          className="px-4 py-2 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent-hover"
        >
          Try again
        </button>
      </div>
    </div>
  )
}
