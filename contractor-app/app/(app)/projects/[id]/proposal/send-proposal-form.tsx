"use client"

import { useState, useTransition } from "react"

export function SendProposalForm({
  defaultEmail,
  clientName,
  action,
}: {
  defaultEmail: string | null
  clientName: string | null
  action: (formData: FormData) => Promise<{ ok: boolean; error?: string }>
}) {
  const [pending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ type: "ok" | "err"; msg: string } | null>(null)

  return (
    <div className="bg-surface border border-border rounded-lg p-6">
      <h2 className="text-base font-semibold text-foreground mb-1">Send to client</h2>
      <p className="text-xs text-foreground-soft mb-4">
        Sends the PDF as an email attachment via Resend. Project status will move from
        Draft to Sent on first send.
      </p>

      <form
        action={(fd) =>
          startTransition(async () => {
            setFeedback(null)
            const r = await action(fd)
            if (r.ok) {
              setFeedback({ type: "ok", msg: "Proposal email sent." })
            } else {
              setFeedback({ type: "err", msg: r.error ?? "Send failed" })
            }
          })
        }
        className="space-y-3"
      >
        <div>
          <label className="block text-xs font-medium text-foreground-muted mb-1">
            To
          </label>
          <input
            name="toEmail"
            type="email"
            required
            defaultValue={defaultEmail ?? ""}
            placeholder="client@example.com"
            className="w-full text-sm text-foreground border border-border rounded px-3 py-2 bg-surface focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-foreground-muted mb-1">
            Personal note (optional)
          </label>
          <textarea
            name="message"
            rows={3}
            placeholder={
              clientName
                ? `Hi ${clientName}, here's the proposal we discussed. Let me know if you have any questions!`
                : "Optional message — leave blank for a default."
            }
            className="w-full text-sm text-foreground border border-border rounded px-3 py-2 bg-surface focus:outline-none focus:ring-2 focus:ring-accent resize-y"
          />
        </div>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover disabled:opacity-50 transition-colors"
          >
            {pending ? "Sending…" : "📧 Send proposal"}
          </button>
          {feedback && (
            <span
              aria-live="polite"
              className={
                feedback.type === "ok" ? "text-sm text-success" : "text-sm text-danger"
              }
            >
              {feedback.msg}
            </span>
          )}
        </div>
      </form>
    </div>
  )
}
