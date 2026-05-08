"use client"

import { useEffect } from "react"

/**
 * Last-resort error boundary that catches errors in the root layout
 * itself. Must define its own <html>/<body> because the root layout
 * failed. Keep this file tiny + dependency-free — anything imported here
 * could be the source of the layout error.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[global-error.tsx]", error)
  }, [error])

  return (
    <html lang="en">
      <body
        style={{
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          background: "#fafafa",
          color: "#18181b",
          margin: 0,
          padding: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            maxWidth: 480,
            width: "100%",
            padding: 24,
            background: "#fff",
            border: "1px solid #e7e5e0",
            borderRadius: 8,
            margin: 16,
          }}
        >
          <h1 style={{ marginTop: 0, fontSize: 18 }}>Application error</h1>
          <p style={{ color: "#52525b", fontSize: 14, lineHeight: 1.5 }}>
            The app couldn&rsquo;t load. Try reloading. If that fails, check
            Vercel logs for an entry near this timestamp.
          </p>
          <p style={{ fontFamily: "monospace", fontSize: 12, color: "#71717a" }}>
            {error.digest ? `Digest: ${error.digest}` : null}
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              marginTop: 12,
              padding: "8px 16px",
              background: "#18181b",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  )
}
