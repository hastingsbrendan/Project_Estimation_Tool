"use client"

import { usePathname } from "next/navigation"
import { useEffect, useRef, useState, useTransition } from "react"

export function FeedbackButton({
  action,
}: {
  action: (formData: FormData) => Promise<{ ok: boolean; error?: string }>
}) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ type: "ok" | "err"; msg: string } | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (open) textareaRef.current?.focus()
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true)
          setFeedback(null)
        }}
        className="fixed bottom-4 right-4 z-20 bg-accent text-white rounded-full shadow-lg w-12 h-12 flex items-center justify-center text-lg hover:bg-accent-hover transition-colors print:hidden"
        title="Send feedback"
        aria-label="Send feedback"
      >
        💬
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="feedback-heading"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-black/50 flex items-end sm:items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-surface rounded-lg shadow-xl w-full max-w-md p-5"
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <h2 id="feedback-heading" className="text-base font-semibold text-foreground">
                  Send feedback
                </h2>
                <p className="text-xs text-foreground-soft mt-0.5">
                  Bug, idea, or rant — sent straight to the developer.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-foreground-soft hover:text-foreground text-sm px-1"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <form
              action={(fd) =>
                startTransition(async () => {
                  setFeedback(null)
                  const r = await action(fd)
                  if (r.ok) {
                    setFeedback({ type: "ok", msg: "Thanks — got it." })
                    setTimeout(() => {
                      setOpen(false)
                      setFeedback(null)
                    }, 1500)
                  } else {
                    setFeedback({ type: "err", msg: r.error ?? "Send failed" })
                  }
                })
              }
            >
              <input type="hidden" name="path" value={pathname} />
              <textarea
                ref={textareaRef}
                name="message"
                rows={5}
                required
                placeholder="What's broken, missing, or confusing?"
                className="w-full text-sm border border-border rounded p-2 bg-surface focus:outline-none focus:ring-2 focus:ring-accent resize-y"
              />
              <div className="flex items-center justify-between mt-3">
                <span className="text-xs text-foreground-soft truncate max-w-[60%]" title={pathname}>
                  Page: {pathname}
                </span>
                <div className="flex items-center gap-2">
                  {feedback && (
                    <span
                      aria-live="polite"
                      className={
                        feedback.type === "ok"
                          ? "text-xs text-success"
                          : "text-xs text-danger"
                      }
                    >
                      {feedback.msg}
                    </span>
                  )}
                  <button
                    type="submit"
                    disabled={pending}
                    className="px-3 py-1.5 bg-accent text-white rounded text-sm font-medium hover:bg-accent-hover disabled:opacity-50"
                  >
                    {pending ? "Sending…" : "Send"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
