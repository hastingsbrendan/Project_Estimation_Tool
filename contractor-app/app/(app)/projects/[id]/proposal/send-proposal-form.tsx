"use client"

import { useEffect, useState, useTransition } from "react"

export function SendProposalForm({
  defaultEmail,
  clientName,
  contractorEmail,
  action,
}: {
  defaultEmail: string | null
  clientName: string | null
  /**
   * The signed-in contractor's email. Used to pre-fill the "Send test to
   * myself" override and to default the CC checkbox so the contractor
   * always has a copy in their own sent folder.
   */
  contractorEmail: string | null
  action: (formData: FormData) => Promise<{ ok: boolean; error?: string }>
}) {
  const [pending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ type: "ok" | "err"; msg: string } | null>(
    null,
  )

  // Auto-clear success / error feedback after 5 s so it doesn't sit stale.
  useEffect(() => {
    if (!feedback) return
    const t = setTimeout(() => setFeedback(null), 5000)
    return () => clearTimeout(t)
  }, [feedback])

  function submit(fd: FormData, isTest: boolean) {
    if (isTest && contractorEmail) {
      // Override "to" to the contractor's own address. Server still uses
      // whatever's in the form, so we mutate the form data first.
      fd.set("toEmail", contractorEmail)
      // Don't CC yourself on a self-test — that'd be one extra duplicate.
      fd.set("cc", "0")
    }
    startTransition(async () => {
      setFeedback(null)
      const r = await action(fd)
      if (r.ok) {
        setFeedback({
          type: "ok",
          msg: isTest ? "Test sent to your own email." : "Proposal email sent.",
        })
      } else {
        setFeedback({ type: "err", msg: r.error ?? "Send failed" })
      }
    })
  }

  return (
    <div className="bg-surface border border-border rounded-lg p-6">
      <h2 className="text-base font-semibold text-foreground mb-1">Send to client</h2>
      <p className="text-xs text-foreground-soft mb-4">
        Sends the PDF as an email attachment via Resend. Project status will move
        from Draft to Sent on first send. Use &ldquo;Send test to myself&rdquo; first
        if you want to preview what the client will see.
      </p>

      <form
        action={(fd) => submit(fd, false)}
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

        {contractorEmail && (
          <label className="flex items-start gap-2 text-sm text-foreground-muted cursor-pointer select-none">
            <input
              type="checkbox"
              name="cc"
              value="1"
              defaultChecked
              className="mt-0.5 accent-accent shrink-0"
            />
            <span>
              CC me at <strong className="text-foreground">{contractorEmail}</strong>{" "}
              so I have a copy in my sent folder.
            </span>
          </label>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="submit"
            disabled={pending}
            className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover disabled:opacity-50 transition-colors"
          >
            {pending ? "Sending…" : "📧 Send proposal"}
          </button>
          {contractorEmail && (
            <button
              type="button"
              disabled={pending}
              onClick={(e) => {
                const form = (e.currentTarget as HTMLButtonElement).form
                if (!form) return
                const fd = new FormData(form)
                submit(fd, true)
              }}
              className="px-3 py-2 bg-surface border border-border text-foreground rounded-lg text-sm font-medium hover:bg-surface-muted disabled:opacity-50"
              title="Send the proposal to your own email so you can see exactly what the client will receive"
            >
              Send test to myself
            </button>
          )}
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
