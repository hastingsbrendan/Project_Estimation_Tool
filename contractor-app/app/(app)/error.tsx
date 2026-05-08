"use client"

import { useEffect, useRef, useState } from "react"
import { usePathname } from "next/navigation"

/**
 * In-app error boundary. Wraps everything inside (app)/layout.tsx (so the
 * user is signed in, the header renders, and we can surface a friendlier
 * recovery flow including a one-click "report this error" path that hits
 * the existing feedback webhook with all the context pre-filled.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const pathname = usePathname()
  const [reported, setReported] = useState<"idle" | "sending" | "ok" | "err">(
    "idle",
  )
  const autoReportFired = useRef(false)

  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[(app)/error.tsx]", error)
  }, [error])

  // Auto-report on mount so we always have a log line + webhook ping for
  // every prod error, no manual click required. The button below still
  // works for re-sending if the auto-report hits a network failure.
  useEffect(() => {
    if (autoReportFired.current) return
    autoReportFired.current = true
    void reportThis(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const digest = error.digest ?? null
  const shortMsg = (error.message || "Unexpected error").split("\n")[0].slice(0, 200)

  async function reportThis(auto = false) {
    setReported("sending")
    try {
      const fd = new FormData()
      fd.set("path", pathname)
      fd.set("auto", auto ? "1" : "0")
      fd.set("digest", digest ?? "")
      fd.set(
        "message",
        [
          auto ? "[auto] Error boundary triggered" : "[manual] Error boundary report",
          `Page: ${pathname}`,
          `Digest: ${digest ?? "(none)"}`,
          `Message: ${shortMsg}`,
          `User-agent: ${typeof navigator !== "undefined" ? navigator.userAgent : "?"}`,
          `Time: ${new Date().toISOString()}`,
        ].join("\n"),
      )
      const r = await fetch("/api/error-report", { method: "POST", body: fd })
      setReported(r.ok ? "ok" : "err")
    } catch {
      setReported("err")
    }
  }

  return (
    <div className="max-w-2xl mx-auto py-8">
      <div className="bg-surface border border-border rounded-lg p-6">
        <div className="flex items-start gap-3 mb-4">
          <span className="text-2xl shrink-0" aria-hidden="true">⚠️</span>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-foreground">
              Something broke on this page
            </h1>
            <p className="text-sm text-foreground-muted mt-1">
              The error has been logged. Click &ldquo;Report this&rdquo; to
              push it to your feedback channel with the page + digest
              already filled in.
            </p>
          </div>
        </div>

        <div className="bg-surface-muted border border-border rounded-md p-3 text-xs space-y-1 mb-4 font-mono">
          <div>
            <span className="text-foreground-soft">Page: </span>
            <span className="text-foreground">{pathname}</span>
          </div>
          <div>
            <span className="text-foreground-soft">Message: </span>
            <span className="text-foreground break-words">{shortMsg}</span>
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
          To find this in Vercel: search the function logs for the digest above
          OR for any unique part of the message.
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
          <button
            type="button"
            onClick={() => reportThis(false)}
            disabled={reported === "sending" || reported === "ok"}
            className="px-4 py-2 bg-surface border border-border text-foreground-muted rounded-md text-sm font-medium hover:bg-surface-muted disabled:opacity-50"
          >
            {reported === "sending" && "Reporting…"}
            {reported === "idle" && "Report this"}
            {reported === "ok" && "Reported ✓"}
            {reported === "err" && "Report failed — try again"}
          </button>
        </div>
      </div>
    </div>
  )
}
