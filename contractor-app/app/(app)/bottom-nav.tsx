"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

/**
 * Mobile bottom-tab navigation. Renders below `sm:` only — the desktop
 * top nav handles those breakpoints. Five primary destinations match
 * the contractor's daily flow:
 *
 *   Projects  Materials  Services  Receipts  Subs
 *
 * Each tab highlights when its route prefix matches the current path
 * (so /projects/abc still highlights "Projects"). Tap targets are
 * 56px tall to comfortably exceed the 44px iOS guideline.
 *
 * Sits in a fixed footer above the FeedbackButton FAB; we add
 * `pb-16` to the main element in layout.tsx so content doesn't slide
 * under it.
 */

const TABS = [
  // Today replaced the second catalog tab: price-book maintenance is a
  // monthly chore, but "what needs my attention" is a daily one. The
  // Services catalog is reachable via the Materials ↔ Services toggle
  // on the catalog pages (and the desktop top nav).
  { href: "/today", label: "Today", icon: "☀️" },
  { href: "/projects", label: "Projects", icon: "📋" },
  { href: "/catalog/materials", label: "Catalog", icon: "📦" },
  { href: "/receipts", label: "Receipts", icon: "🧾" },
  { href: "/subs", label: "Subs", icon: "👥" },
] as const

export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Primary"
      className="sm:hidden fixed bottom-0 inset-x-0 z-20 bg-surface border-t border-border pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="grid grid-cols-5">
        {TABS.map((tab) => {
          // Match exact path OR a subroute. The Catalog tab owns both
          // /catalog/materials and /catalog/services; Projects owns its
          // subroutes including the project materials list.
          const active =
            pathname === tab.href ||
            (tab.href === "/catalog/materials" && pathname.startsWith("/catalog")) ||
            (tab.href === "/projects" && pathname.startsWith("/projects/")) ||
            (tab.href !== "/projects" &&
              tab.href !== "/catalog/materials" &&
              pathname.startsWith(tab.href + "/"))
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center justify-center gap-0.5 h-14 text-[10px] font-medium transition-colors ${
                  active
                    ? "text-accent"
                    : "text-foreground-soft hover:text-foreground"
                }`}
              >
                <span className="text-base leading-none" aria-hidden="true">
                  {tab.icon}
                </span>
                <span>{tab.label}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
