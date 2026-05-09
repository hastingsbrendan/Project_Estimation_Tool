/**
 * Single source of truth for the small amber "warning chip" used in
 * places like "SKU incomplete", "1099 tax ID missing", etc. Three
 * subtly-different styles existed before this component (different
 * padding, different background opacity, different text size); this
 * unifies them.
 *
 * Tone:
 *   - "warning" (default) — amber. The contractor should fix this
 *     when convenient but it's not blocking anything.
 *   - "danger" — red. Required action; PII missing, OOS, etc.
 */

type Tone = "warning" | "danger"
type Size = "xs" | "sm"

const TONES: Record<Tone, string> = {
  warning: "bg-amber-50 border border-amber-200 text-amber-900",
  danger: "bg-red-50 border border-red-200 text-danger",
}

const SIZES: Record<Size, string> = {
  xs: "text-[10px] px-1.5 py-0.5",
  sm: "text-xs px-2 py-0.5",
}

export function WarningChip({
  children,
  tone = "warning",
  size = "xs",
  className = "",
  title,
}: {
  children: React.ReactNode
  tone?: Tone
  size?: Size
  className?: string
  /** HTML title attribute — explanation tooltip on hover. */
  title?: string
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center font-medium rounded leading-tight whitespace-nowrap ${TONES[tone]} ${SIZES[size]} ${className}`}
    >
      {children}
    </span>
  )
}
