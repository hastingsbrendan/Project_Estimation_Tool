import Link from "next/link"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/db"
import { calcEstimate, formatCurrency } from "@/lib/calc"
import { Card } from "@/components/ui/card"
import { StatusBadge } from "@/components/ui/status-badge"

export const dynamic = "force-dynamic"

/**
 * Today — the morning-coffee view. Surfaces the things that need a
 * decision or are quietly costing money, instead of making the
 * contractor remember to check each page:
 *
 *   1. Money outstanding — unpaid milestones across active jobs
 *   2. Proposals waiting on a client (sent, not yet accepted), with
 *      expiry countdown — we always computed expiry but never showed
 *      it to the contractor, only to the client.
 *   3. Jump back in — most recently touched active projects
 */
export default async function TodayPage() {
  const session = await auth()
  if (!session?.user?.email) redirect("/login")
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  })
  if (!user) redirect("/login")

  const [unpaidMilestones, sentProjects, recentProjects] = await Promise.all([
    prisma.milestone.findMany({
      where: {
        paidAt: null,
        project: { userId: user.id, archived: false, isTemplate: false },
      },
      include: { project: { select: { id: true, name: true, clientName: true } } },
      orderBy: [{ invoicedAt: "desc" }, { createdAt: "asc" }],
    }),
    prisma.project.findMany({
      where: {
        userId: user.id,
        archived: false,
        isTemplate: false,
        status: "sent",
        acceptedAt: null,
      },
      select: {
        id: true,
        name: true,
        clientName: true,
        proposalSentAt: true,
        validForDays: true,
      },
      orderBy: { proposalSentAt: "asc" },
    }),
    prisma.project.findMany({
      where: { userId: user.id, archived: false, isTemplate: false },
      orderBy: { updatedAt: "desc" },
      take: 4,
      include: { sections: { include: { lineItems: true } } },
    }),
  ])

  const outstanding = unpaidMilestones.reduce((s, m) => s + m.amount, 0)
  const invoicedUnpaid = unpaidMilestones.filter((m) => m.invoicedAt)

  const now = Date.now()
  const proposalsWithExpiry = sentProjects.map((p) => {
    const sent = p.proposalSentAt?.getTime() ?? null
    const daysLeft =
      sent != null
        ? Math.ceil((sent + p.validForDays * 86400_000 - now) / 86400_000)
        : null
    return { ...p, daysLeft }
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Today</h1>
        <p className="text-sm text-foreground-muted mt-1">
          {new Date().toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </p>
      </div>

      {/* Money outstanding */}
      <section>
        <h2 className="text-sm font-semibold text-foreground mb-2">
          Money outstanding
        </h2>
        {unpaidMilestones.length === 0 ? (
          <Card size="compact">
            <p className="text-sm text-foreground-soft">
              Nothing unpaid. Add payment milestones on a project to track
              what&rsquo;s owed.
            </p>
          </Card>
        ) : (
          <Card size="compact" className="space-y-2">
            <div className="flex items-baseline justify-between">
              <p className="text-2xl font-bold text-accent tabular-nums">
                {formatCurrency(outstanding)}
              </p>
              <p className="text-xs text-foreground-soft">
                {unpaidMilestones.length} open milestone
                {unpaidMilestones.length === 1 ? "" : "s"}
                {invoicedUnpaid.length > 0 &&
                  ` · ${invoicedUnpaid.length} invoiced, awaiting payment`}
              </p>
            </div>
            <ul className="divide-y divide-border">
              {unpaidMilestones.slice(0, 6).map((m) => (
                <li key={m.id} className="py-1.5 flex items-center justify-between gap-2 text-sm">
                  <Link
                    href={`/projects/${m.project.id}`}
                    className="min-w-0 truncate text-foreground hover:text-accent"
                  >
                    {m.project.name}
                    <span className="text-foreground-soft"> · {m.label}</span>
                    {m.invoicedAt && (
                      <span className="text-xs text-foreground-soft"> · invoiced</span>
                    )}
                  </Link>
                  <span className="tabular-nums font-medium text-foreground shrink-0">
                    {formatCurrency(m.amount)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      {/* Proposals out */}
      <section>
        <h2 className="text-sm font-semibold text-foreground mb-2">
          Waiting on clients
        </h2>
        {proposalsWithExpiry.length === 0 ? (
          <Card size="compact">
            <p className="text-sm text-foreground-soft">
              No proposals out. Send one from a project&rsquo;s Proposal tab.
            </p>
          </Card>
        ) : (
          <Card size="compact">
            <ul className="divide-y divide-border">
              {proposalsWithExpiry.map((p) => (
                <li key={p.id} className="py-2 flex items-center justify-between gap-2 text-sm">
                  <Link
                    href={`/projects/${p.id}/proposal`}
                    className="min-w-0 truncate text-foreground hover:text-accent"
                  >
                    {p.name}
                    {p.clientName && (
                      <span className="text-foreground-soft"> · {p.clientName}</span>
                    )}
                  </Link>
                  {p.daysLeft != null && (
                    <span
                      className={`text-xs shrink-0 tabular-nums ${
                        p.daysLeft <= 0
                          ? "text-danger font-medium"
                          : p.daysLeft <= 7
                            ? "text-warning font-medium"
                            : "text-foreground-soft"
                      }`}
                    >
                      {p.daysLeft <= 0
                        ? "expired — follow up"
                        : `${p.daysLeft}d left`}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      {/* Jump back in */}
      <section>
        <h2 className="text-sm font-semibold text-foreground mb-2">Jump back in</h2>
        {recentProjects.length === 0 ? (
          <Card size="empty">
            <p className="text-sm text-foreground-muted mb-4">
              No projects yet — start your first estimate.
            </p>
            <Link
              href="/projects/new"
              className="inline-flex items-center gap-2 bg-accent text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors"
            >
              + New Project
            </Link>
          </Card>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {recentProjects.map((p) => {
              const lineItems = p.sections.flatMap((s) =>
                s.lineItems.map((li) => ({
                  quantity: li.quantity,
                  unitPrice: li.unitPrice,
                  kind: li.kind as "material" | "labor",
                })),
              )
              const total = calcEstimate({
                lineItems,
                markupPct: p.markupPct,
                taxRate: p.taxRate,
              }).total
              return (
                <li
                  key={p.id}
                  className="bg-surface border border-border rounded-lg p-3 hover:border-accent transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/projects/${p.id}`}
                      className="font-medium text-foreground truncate flex-1 hover:text-accent"
                    >
                      {p.name}
                    </Link>
                    <StatusBadge status={p.status} />
                  </div>
                  <div className="flex items-center justify-between mt-1 text-xs text-foreground-soft">
                    <span className="truncate">{p.clientName ?? "No client"}</span>
                    <span className="tabular-nums font-medium text-foreground">
                      {formatCurrency(total)}
                    </span>
                  </div>
                  <div className="flex gap-4 mt-2 text-xs">
                    <Link href={`/projects/${p.id}`} className="text-accent hover:underline">
                      Estimate →
                    </Link>
                    <Link
                      href={`/projects/${p.id}/materials`}
                      className="text-accent hover:underline"
                    >
                      Truck list →
                    </Link>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
