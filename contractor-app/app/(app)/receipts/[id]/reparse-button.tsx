"use client"

import { useState, useTransition } from "react"

export function ReparseButton({
  receiptId,
  action,
}: {
  receiptId: string
  action: (id: string) => Promise<{ ok: boolean; error?: string }>
}) {
  const [pending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<string>("")

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setFeedback("")
            const r = await action(receiptId)
            setFeedback(r.ok ? "Re-parsed." : (r.error ?? "Failed"))
            setTimeout(() => setFeedback(""), 4000)
          })
        }
        className="text-xs text-foreground-muted hover:text-foreground transition-colors"
      >
        {pending ? "Parsing…" : "↻ Re-parse with AI"}
      </button>
      {feedback && (
        <span aria-live="polite" className="text-xs text-foreground-soft ml-2">
          {feedback}
        </span>
      )}
    </div>
  )
}
