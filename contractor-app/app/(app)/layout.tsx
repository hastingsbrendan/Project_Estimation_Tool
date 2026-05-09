import { auth, signOut } from "@/auth"
import Link from "next/link"
import { redirect } from "next/navigation"
import { FeedbackButton } from "./feedback-button"
import { sendFeedback } from "./feedback-actions"
import { BottomNav } from "./bottom-nav"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect("/login")

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-surface border-b border-border sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <Link href="/projects" className="flex items-center gap-2 hover:opacity-80 transition-opacity shrink-0">
            <span className="inline-flex items-center justify-center w-7 h-7 bg-accent rounded-md text-white text-sm">
              🔨
            </span>
            <span className="font-semibold text-foreground hidden sm:inline">Contractor App</span>
          </Link>
          {/* Inline nav hides on mobile — BottomNav takes over below sm:.
              Five destinations don't fit on a 375px header without
              wrap or overflow, and tap targets are uncomfortably
              cramped even on tablet. */}
          <nav className="hidden sm:flex items-center gap-1 text-sm">
            <Link
              href="/projects"
              className="px-3 py-2 rounded-md text-foreground-muted hover:bg-accent-soft hover:text-foreground transition-colors"
            >
              Projects
            </Link>
            <Link
              href="/receipts"
              className="px-3 py-2 rounded-md text-foreground-muted hover:bg-accent-soft hover:text-foreground transition-colors"
            >
              Receipts
            </Link>
            <Link
              href="/subs"
              className="px-3 py-2 rounded-md text-foreground-muted hover:bg-accent-soft hover:text-foreground transition-colors"
            >
              Subs
            </Link>
            <Link
              href="/catalog/services"
              className="px-3 py-2 rounded-md text-foreground-muted hover:bg-accent-soft hover:text-foreground transition-colors"
            >
              Services
            </Link>
            <Link
              href="/catalog/materials"
              className="px-3 py-2 rounded-md text-foreground-muted hover:bg-accent-soft hover:text-foreground transition-colors"
            >
              Materials
            </Link>
          </nav>
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-sm text-foreground-muted hidden md:block">{session.user?.email}</span>
            <form
              action={async () => {
                "use server"
                await signOut({ redirectTo: "/login" })
              }}
            >
              <button
                type="submit"
                className="text-sm text-foreground-muted hover:text-foreground transition-colors"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      {/* pb-20 reserves room for the fixed BottomNav (h-14 + safe-area)
          on phones; falls back to py-8 on sm+. */}
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-6 pt-6 pb-20 sm:py-8">
        {children}
      </main>
      <FeedbackButton action={sendFeedback} />
      <BottomNav />
    </div>
  )
}
