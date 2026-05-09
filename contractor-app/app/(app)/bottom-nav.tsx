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
  { href: "/projects", label: "Projects", icon: "📋" },
  { href: "/catalog/materials", label: "Materials", icon: "📦" },
  { href: "/catalog/services", label: "Services", icon: "🔧" },
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
          // Match exact path OR a subroute, except for "/projects" which
          // we want to NOT match "/projects/[id]/materials" (that should
          // light up Materials, not Projects). Easiest way: only match
          // exact for top-level routes other than "/", let the more
          // specific routes win.
          const active =
            pathname === tab.href ||
            (tab.href !== "/projects" && pathname.startsWith(tab.href + "/")) ||
            (tab.href === "/projects" &&
              pathname.startsWith("/projects/") &&
              !pathname.endsWith("/materials"))
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
