/**
 * Single source of truth for the small colored "status" pills sprinkled
 * across project list, project detail, receipts list, and the proposal
 * shareable page. Before this component existed, four pages each defined
 * their own STATUS_COLORS lookup with subtle drift (rounded-full vs
 * rounded-md, text-[10px] vs text-xs, etc).
 *
 * Add new statuses here, not in callsites.
 */

const STATUS_TONES: Record<string, string> = {
  // Project lifecycle
  draft: "bg-surface-muted text-foreground-soft",
  sent: "bg-blue-50 text-blue-700",
  accepted: "bg-green-50 text-green-700",
  won: "bg-green-100 text-green-800",
  rejected: "bg-red-50 text-red-700",
  lost: "bg-red-100 text-red-800",

  // Receipt parse state
  pending: "bg-surface-muted text-foreground-soft",
  parsed: "bg-green-50 text-green-700",
  manual: "bg-blue-50 text-blue-700",
  error: "bg-red-50 text-red-700",
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  accepted: "Accepted",
  won: "Won",
  rejected: "Rejected",
  lost: "Lost",
  pending: "Pending",
  parsed: "Parsed",
  manual: "Manual",
  error: "Error",
}

export function StatusBadge({
  status,
  label,
  className = "",
}: {
  status: string
  /** Override the auto-resolved label. Useful for one-off statuses. */
  label?: string
  className?: string
}) {
  const tone =
    STATUS_TONES[status] ?? "bg-surface-muted text-foreground-soft"
  const text = label ?? STATUS_LABELS[status] ?? status
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${tone} ${className}`}
    >
      {text}
    </span>
  )
}
