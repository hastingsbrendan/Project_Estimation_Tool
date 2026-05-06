"use client"

import { useState, useTransition } from "react"

export function ShareLinkPanel({
  projectId,
  initialToken,
  enableAction,
  disableAction,
}: {
  projectId: string
  initialToken: string | null
  enableAction: (id: string) => Promise<{ token: string }>
  disableAction: (id: string) => Promise<void>
}) {
  const [token, setToken] = useState<string | null>(initialToken)
  const [pending, startTransition] = useTransition()
  const [copied, setCopied] = useState(false)

  const url = token
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/proposal/${token}`
    : null

  const copy = async () => {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // ignore — user can still triple-click + copy
    }
  }

  return (
    <div className="bg-surface border border-border rounded-lg p-6">
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="text-base font-semibold text-foreground">Share link</h2>
        {token && (
          <span className="text-[10px] uppercase tracking-wider text-success">Live</span>
        )}
      </div>
      <p className="text-xs text-foreground-soft mb-4">
        Public, read-only link your client can open without signing in. They can view
        the proposal in the browser and download the same PDF you&apos;d email.
        Anyone with the link can see it — rotate it if you need to revoke.
      </p>

      {token && url ? (
        <div className="space-y-3">
          <div className="flex items-stretch gap-2">
            <input
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              className="flex-1 text-sm border border-border rounded px-2 py-1.5 bg-surface-muted text-foreground tabular-nums truncate"
            />
            <button
              type="button"
              onClick={copy}
              className="px-3 py-1.5 bg-accent text-white rounded text-sm font-medium hover:bg-accent-hover whitespace-nowrap"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const r = await enableAction(projectId)
                  setToken(r.token)
                })
              }
              className="text-foreground-muted hover:text-foreground"
              title="Generate a new token; the old link will stop working"
            >
              ↻ Rotate link
            </button>
            <span className="text-foreground-soft">·</span>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await disableAction(projectId)
                  setToken(null)
                })
              }
              className="text-foreground-muted hover:text-danger"
            >
              Disable
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const r = await enableAction(projectId)
              setToken(r.token)
            })
          }
          className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover disabled:opacity-50"
        >
          {pending ? "Generating…" : "Generate share link"}
        </button>
      )}
    </div>
  )
}
