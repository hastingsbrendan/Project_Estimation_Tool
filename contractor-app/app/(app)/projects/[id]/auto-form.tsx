"use client"

import { useRef, useState, useTransition, type FormHTMLAttributes, type ReactNode } from "react"

/**
 * A form that auto-submits when any input inside it loses focus (blur),
 * but only if the value has actually changed. Shows a brief "Saved" pulse
 * on success.
 */
export function AutoSaveForm({
  action,
  children,
  className,
  ...rest
}: {
  action: (formData: FormData) => Promise<void>
  children: ReactNode
  className?: string
} & Omit<FormHTMLAttributes<HTMLFormElement>, "action">) {
  const formRef = useRef<HTMLFormElement>(null)
  const [pending, startTransition] = useTransition()
  const [savedFlash, setSavedFlash] = useState(false)
  const lastSerialized = useRef<string>("")

  // Capture the initial form state once mounted so we know whether things
  // actually changed before submitting.
  const captureInitial = (form: HTMLFormElement) => {
    if (lastSerialized.current === "") {
      lastSerialized.current = serializeForm(form)
    }
  }

  const handleBlur = (e: React.FocusEvent<HTMLFormElement>) => {
    const form = e.currentTarget
    captureInitial(form)
    // If the related target is inside the form, it's just a focus shift, not a real blur.
    if (form.contains(e.relatedTarget as Node | null)) return

    const current = serializeForm(form)
    if (current === lastSerialized.current) return
    lastSerialized.current = current

    const fd = new FormData(form)
    startTransition(async () => {
      try {
        await action(fd)
        setSavedFlash(true)
        setTimeout(() => setSavedFlash(false), 1200)
      } catch {
        // swallow — user can re-submit; we surface validation later
      }
    })
  }

  return (
    <form
      ref={formRef}
      onBlur={handleBlur}
      onFocus={(e) => captureInitial(e.currentTarget)}
      className={className}
      action={(fd) => startTransition(async () => {
        try {
          await action(fd)
          setSavedFlash(true)
          setTimeout(() => setSavedFlash(false), 1200)
        } catch {}
      })}
      {...rest}
    >
      {children}
      {/* Tiny status indicator — invisible unless saving or just saved */}
      <span
        aria-live="polite"
        className={`pointer-events-none ml-2 text-[10px] font-medium tabular-nums transition-opacity ${
          pending ? "opacity-60 text-foreground-soft" : savedFlash ? "opacity-100 text-success" : "opacity-0"
        }`}
      >
        {pending ? "Saving…" : "Saved"}
      </span>
    </form>
  )
}

function serializeForm(form: HTMLFormElement): string {
  const fd = new FormData(form)
  const entries: string[] = []
  for (const [k, v] of fd.entries()) {
    entries.push(`${k}=${typeof v === "string" ? v : "[file]"}`)
  }
  return entries.sort().join("&")
}
