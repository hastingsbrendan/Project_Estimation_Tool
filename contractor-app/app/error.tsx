"use client"

import { useEffect } from "react"

/**
 * Route-segment error boundary that catches any unhandled error in a
 * Next.js page or server component. Renders inside the root <html>/<body>,
 * so it gets the global styles. Replaces Next's dark "This page couldn't
 * load" page with something the user can actually act on.
 *
 * `error.digest` is a deterministic hash Next.js generates from the error
 * message + stack — searchable in Vercel logs alongside the JSON log line
 * we emit from withActionLogging / withRouteLogging.
 */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Mirror to the browser console so the developer can see it via DevTools
    // even when the server log has trimmed the message in production.
    // eslint-disable-next-line no-console
    console.error("[error.tsx]", error)
  }, [error])

  const digest = error.digest ?? null
  const message = error.message || "An unexpected error occurred."

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-lg w-full bg-surface border border-border rounded-lg shadow-sm p-6 sm:p-8">
        <div className="flex items-start gap-3 mb-4">
          <span className="text-2xl shrink-0" aria-hidden="true">⚠️</span>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-foreground">Something went wrong</h1>
            <p className="text-sm text-foreground-muted mt-1">
              We hit an error rendering this page. The team has been notified.
            </p>
          </div>
        </div>

        <div className="bg-surface-muted border border-border rounded-md p-3 text-xs space-y-1 mb-4 font-mono">
          <div>
            <span className="text-foreground-soft">Message: </span>
            <span className="text-foreground break-words">{message}</span>
          </div>
          {digest && (
            <div>
              <span className="text-foreground-soft">Digest: </span>
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(digest)}
                className="text-foreground hover:text-accent underline decoration-dotted"
                title="Click to copy"
              >
                {digest}
              </button>
            </div>
          )}
        </div>

        <p className="text-xs text-foreground-soft mb-4">
          Please share the digest above when reporting this — it lets us find
          the matching log line in Vercel quickly.
        </p>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => reset()}
            className="px-4 py-2 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent-hover"
          >
            Try again
          </button>
          <a
            href="/projects"
            className="px-4 py-2 bg-surface border border-border text-foreground rounded-md text-sm font-medium hover:bg-surface-muted"
          >
            Go to projects
          </a>
        </div>
      </div>
    </div>
  )
}
