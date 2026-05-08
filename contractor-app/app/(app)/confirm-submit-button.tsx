"use client"

import type { ReactNode } from "react"

/**
 * A submit button that shows a confirm() dialog before allowing the parent
 * form to actually submit. Has to be a client component because event
 * handlers (onClick) can't be passed from a server component to a DOM
 * element prop — that's a hard runtime error in Next.js production builds
 * even though it works fine in dev.
 *
 * Use inside any server-rendered <form action={serverAction}>:
 *   <ConfirmSubmitButton confirmText="Delete this receipt?">
 *     Delete receipt
 *   </ConfirmSubmitButton>
 *
 * Once we replace the native confirm() with a styled modal (audit
 * follow-up), the implementation behind this prop stays the same so
 * callers don't need to change.
 */
export function ConfirmSubmitButton({
  confirmText,
  children,
  className,
}: {
  confirmText: string
  children: ReactNode
  className?: string
}) {
  return (
    <button
      type="submit"
      onClick={(e) => {
        if (!window.confirm(confirmText)) {
          e.preventDefault()
        }
      }}
      className={className}
    >
      {children}
    </button>
  )
}
