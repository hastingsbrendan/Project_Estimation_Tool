import Link from "next/link"
import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { formatCurrency } from "@/lib/calc"
import { ensureDefaultSpecialties } from "@/lib/seed-default-specialties"
import { createSubcontractor } from "./actions"
import { NewSubcontractorButton } from "./new-subcontractor-button"

export default async function SubsListPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>
}) {
  const params = await searchParams
  const showArchived = params.archived === "1"

  const session = await auth()
  if (!session?.user?.email) redirect("/login")
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  })
  if (!user) redirect("/login")

  // Self-heal: if specialties weren't seeded at deploy time, seed them now.
  await ensureDefaultSpecialties()

  const subs = await prisma.subcontractor.findMany({
    where: { userId: user.id, archived: showArchived },
    orderBy: { name: "asc" },
    include: {
      specialties: { include: { specialty: true } },
      ratings: { select: { overallStars: true } },
      payments: { select: { amount: true, paidAt: true } },
    },
  })

  // Pre-compute YTD totals + average rating per sub.
  const yearStart = new Date(new Date().getFullYear(), 0, 1)
  const enriched = subs.map((s) => {
    const ytd = s.payments
      .filter((p) => p.paidAt >= yearStart)
      .reduce((sum, p) => sum + p.amount, 0)
    const avgStars =
      s.ratings.length > 0
        ? s.ratings.reduce((sum, r) => sum + r.overallStars, 0) / s.ratings.length
        : null
    return { ...s, ytd, avgStars }
  })

  const totalCount = enriched.length
  const overThreshold = enriched.filter((s) => s.ytd >= 600 && !s.isCorporation)

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Subcontractors</h1>
          <p className="text-sm text-foreground-muted mt-1">
            Track who you&rsquo;ve hired, what they cost, and how they performed.
            At year-end, generate 1099-NEC paperwork for anyone over $600.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {overThreshold.length > 0 && (
            <Link
              href="/subs/1099"
              className="px-3 py-1.5 bg-amber-50 border border-amber-300 text-amber-900 rounded-md text-xs font-medium hover:bg-amber-100"
            >
              {overThreshold.length} eligible for 1099 →
            </Link>
          )}
          <NewSubcontractorButton action={createSubcontractor} />
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs">
        <Link
          href="/subs"
          className={`px-2.5 py-1 rounded-full ${
            !showArchived
              ? "bg-accent text-white"
              : "bg-surface border border-border text-foreground-muted hover:bg-accent-soft"
          }`}
        >
          Active
        </Link>
        <Link
          href="/subs?archived=1"
          className={`px-2.5 py-1 rounded-full ${
            showArchived
              ? "bg-accent text-white"
              : "bg-surface border border-border text-foreground-muted hover:bg-accent-soft"
          }`}
        >
          Archived
        </Link>
      </div>

      {enriched.length === 0 ? (
        <div className="bg-surface border border-dashed border-border rounded-lg p-8 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-accent-soft rounded-2xl mb-4">
            <span className="text-3xl">👷</span>
          </div>
          <h2 className="text-lg font-semibold text-foreground mb-2">
            {showArchived ? "No archived subs" : "No subs yet"}
          </h2>
          <p className="text-sm text-foreground-muted max-w-md mx-auto mb-6">
            {showArchived
              ? "Archive subs you no longer work with to keep this list focused."
              : "Add the people and businesses you hire — plumbers, electricians, framers. Track payments here so 1099s in January are a button click."}
          </p>
          {!showArchived && (
            <NewSubcontractorButton primary action={createSubcontractor} />
          )}
        </div>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {enriched.map((s) => {
            const primarySpec = s.specialties[0]?.specialty.label ?? null
            const moreSpecs = Math.max(0, s.specialties.length - 1)
            const eligible = s.ytd >= 600 && !s.isCorporation
            const missingTaxId = eligible && !s.taxIdEncrypted
            return (
              <li key={s.id}>
                <Link
                  href={`/subs/${s.id}`}
                  className="block bg-surface border border-border rounded-lg p-4 hover:border-accent transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground truncate">
                        {s.name}
                      </p>
                      {s.contactName && (
                        <p className="text-xs text-foreground-soft truncate">
                          {s.contactName}
                        </p>
                      )}
                    </div>
                    {s.avgStars != null && (
                      <span className="text-xs tabular-nums shrink-0">
                        ⭐ {s.avgStars.toFixed(1)}
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {primarySpec && (
                      <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 bg-accent-soft text-foreground rounded">
                        {primarySpec}
                      </span>
                    )}
                    {moreSpecs > 0 && (
                      <span className="text-[10px] text-foreground-soft">
                        +{moreSpecs}
                      </span>
                    )}
                    {s.isCorporation && (
                      <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 bg-surface-muted text-foreground-soft rounded">
                        Corp
                      </span>
                    )}
                  </div>
                  <div className="mt-3 flex items-baseline justify-between text-xs">
                    <span className="text-foreground-soft">YTD paid</span>
                    <span className="text-foreground tabular-nums font-medium">
                      {formatCurrency(s.ytd)}
                    </span>
                  </div>
                  {missingTaxId && (
                    <p className="mt-2 text-[11px] text-danger">
                      ⚠ Over $600 — tax ID required for 1099
                    </p>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      )}

      {totalCount > 0 && (
        <p className="text-xs text-foreground-soft">
          {totalCount} {totalCount === 1 ? "sub" : "subs"} shown.
        </p>
      )}
    </div>
  )
}
