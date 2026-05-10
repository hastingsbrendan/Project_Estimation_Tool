/**
 * Single source of truth for pill-shaped filter tabs (Active/Archived,
 * All/Projects/Catalog filters, trade filters). Before this component
 * the catalog page used pills, the receipts and subs pages used a
 * slightly different pill, and the projects page used underline tabs.
 *
 * Use this for "filter the list below" affordances. For navigating
 * between major page sections, use the bottom-nav tabs or a sidebar.
 */

import Link from "next/link"
import type { ReactNode } from "react"

const ACTIVE = "bg-accent text-white"
const INACTIVE =
  "bg-surface border border-border text-foreground-muted hover:bg-accent-soft hover:text-foreground"

const BASE = "inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full transition-colors"

/**
 * Pill rendered as a Next/link — for query-string filter switches that
 * SSR + benefit from prefetch. Most filter strips are this variant.
 */
export function TabPillLink({
  href,
  active,
  children,
}: {
  href: string
  active: boolean
  children: ReactNode
}) {
  return (
    <Link href={href} className={`${BASE} ${active ? ACTIVE : INACTIVE}`}>
      {children}
    </Link>
  )
}

/**
 * Pill rendered as a plain button — for client-side filter state where
 * navigation isn't appropriate. Catalog trade filters use this.
 */
export function TabPillButton({
  active,
  onClick,
  children,
  type = "button",
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
  type?: "button" | "submit"
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      className={`${BASE} ${active ? ACTIVE : INACTIVE}`}
    >
      {children}
    </button>
  )
}
