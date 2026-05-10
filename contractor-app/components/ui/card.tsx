/**
 * Single source of truth for the surface-on-paper card chrome used
 * throughout the app. Before this component, ~21 callsites duplicated
 * `bg-surface border border-border rounded-lg p-X` with subtly
 * different padding (p-4 / p-5 / p-6 / p-8) — and the same conceptual
 * card (e.g., a "list item" or "section block") sometimes used
 * different padding on different pages.
 *
 * Padding sizes:
 *   - `compact` (p-4): list-item cards, room cards, dense rows
 *   - `default` (p-5): section blocks, profile cards
 *   - `loose`   (p-6): hero / meta cards with breathing room
 *   - `empty`   (p-8): empty-state blocks (icon + headline + CTA)
 *
 * The component renders a plain `<div>` by default. Pass `as="section"`
 * to get a `<section>` for semantic regions (proposal page uses these).
 *
 * For interactive cards (hoverable list items), set `interactive` to
 * get the standard `hover:border-accent` treatment.
 */

import { type ElementType, type ReactNode } from "react"

type Size = "compact" | "default" | "loose" | "empty"

const PADDING: Record<Size, string> = {
  compact: "p-4",
  default: "p-5",
  loose: "p-6",
  empty: "p-8 text-center",
}

export function Card({
  children,
  size = "default",
  as: Tag = "div" as ElementType,
  interactive = false,
  className = "",
}: {
  children: ReactNode
  size?: Size
  as?: ElementType
  interactive?: boolean
  className?: string
}) {
  const baseClass = `bg-surface border border-border rounded-lg ${PADDING[size]}`
  const interactiveClass = interactive
    ? "hover:border-accent transition-colors"
    : ""
  return (
    <Tag className={`${baseClass} ${interactiveClass} ${className}`.trim()}>
      {children}
    </Tag>
  )
}
