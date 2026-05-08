import { notFound } from "next/navigation"
import { prisma } from "@/lib/db"
import { calcEstimate, formatCurrency, lineItemTotal } from "@/lib/calc"
import { acceptProposal } from "./actions"
import { SignForm } from "./sign-form"

export const metadata = {
  robots: { index: false, follow: false }, // don't index public share links
}

export default async function PublicProposalPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  if (!token || token.length < 16) notFound()

  const project = await prisma.project.findFirst({
    where: { shareToken: token },
    include: {
      sections: {
        include: { lineItems: { orderBy: { order: "asc" } } },
        orderBy: { order: "asc" },
      },
    },
  })
  if (!project) notFound()

  const allLineItems = project.sections.flatMap((s) =>
    s.lineItems.map((li) => ({
      quantity: li.quantity,
      unitPrice: li.unitPrice,
      kind: li.kind as "material" | "labor",
    })),
  )
  const totals = calcEstimate({
    lineItems: allLineItems,
    markupPct: project.markupPct,
    taxRate: project.taxRate,
  })

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-surface border-b border-border">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-5 flex items-center justify-between">
          <div className="text-sm font-bold tracking-widest text-foreground">
            RELIABLE REMODELING
          </div>
          <a
            href={`/api/pdf/proposal-public/${token}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent-hover"
          >
            Download PDF
          </a>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div className="border-l-4 border-accent pl-4">
          <p className="text-xs font-bold tracking-widest text-accent">PROPOSAL</p>
          <h1 className="text-2xl font-bold text-foreground mt-1">{project.name}</h1>
          <p className="text-sm text-foreground-muted mt-1">
            {project.clientName ? `Prepared for ${project.clientName}` : "Prepared for client"}
          </p>
        </div>

        {(project.clientName || project.clientEmail || project.address) && (
          <div className="bg-surface border border-border rounded-lg p-5 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            {project.clientName && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-foreground-soft">Client</p>
                <p className="text-foreground">{project.clientName}</p>
              </div>
            )}
            {project.clientEmail && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-foreground-soft">Email</p>
                <p className="text-foreground">{project.clientEmail}</p>
              </div>
            )}
            {project.address && (
              <div className="sm:col-span-2">
                <p className="text-[10px] uppercase tracking-wider text-foreground-soft">Job site</p>
                <p className="text-foreground">{project.address}</p>
              </div>
            )}
          </div>
        )}

        {project.scope && (
          <section>
            <h2 className="text-sm font-bold uppercase tracking-widest text-foreground border-b border-border pb-2 mb-3">
              Scope of work
            </h2>
            <p className="text-sm text-foreground whitespace-pre-wrap">{project.scope}</p>
          </section>
        )}

        <section>
          <h2 className="text-sm font-bold uppercase tracking-widest text-foreground border-b border-border pb-2 mb-3">
            Estimate breakdown
          </h2>
          <div className="space-y-4">
            {project.sections.map((section) => {
              const subtotal = section.lineItems.reduce((sum, li) => sum + lineItemTotal(li), 0)
              return (
                <div key={section.id} className="bg-surface border border-border rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2 bg-surface-muted border-b border-border">
                    <p className="font-semibold text-foreground">{section.name}</p>
                    <p className="font-medium text-foreground tabular-nums">
                      {formatCurrency(subtotal)}
                    </p>
                  </div>
                  <div className="divide-y divide-border">
                    {section.lineItems.map((li) => (
                      <div
                        key={li.id}
                        className="grid grid-cols-12 gap-2 px-4 py-2 text-sm items-baseline"
                      >
                        <div className="col-span-6 text-foreground">{li.description}</div>
                        <div className="col-span-2 text-right text-foreground-muted tabular-nums">
                          {li.quantity}
                        </div>
                        <div className="col-span-1 text-foreground-muted">{li.unit}</div>
                        <div className="col-span-3 text-right text-foreground tabular-nums">
                          {formatCurrency(lineItemTotal(li))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        <section className="bg-surface border border-border rounded-lg p-5">
          <div className="space-y-1.5 text-sm">
            <Row label="Materials" value={formatCurrency(totals.materialSubtotal)} />
            <Row label="Labor" value={formatCurrency(totals.laborSubtotal)} />
            {project.markupPct > 0 && (
              <Row label={`Markup (${project.markupPct}%)`} value={formatCurrency(totals.markup)} />
            )}
            {project.taxRate > 0 && (
              <Row label={`Sales tax (${project.taxRate}%)`} value={formatCurrency(totals.tax)} />
            )}
          </div>
          <div className="mt-3 pt-3 border-t-2 border-foreground flex items-baseline justify-between">
            <span className="font-bold text-foreground">Total</span>
            <span className="text-2xl font-bold text-accent tabular-nums">
              {formatCurrency(totals.total)}
            </span>
          </div>
        </section>

        {project.exclusions && (
          <section>
            <h2 className="text-sm font-bold uppercase tracking-widest text-foreground border-b border-border pb-2 mb-3">
              Exclusions
            </h2>
            <p className="text-sm text-foreground whitespace-pre-wrap">{project.exclusions}</p>
          </section>
        )}

        {project.paymentSchedule && (
          <section>
            <h2 className="text-sm font-bold uppercase tracking-widest text-foreground border-b border-border pb-2 mb-3">
              Payment schedule
            </h2>
            <p className="text-sm text-foreground whitespace-pre-wrap font-mono">
              {project.paymentSchedule}
            </p>
          </section>
        )}

        {/* Acceptance — signed receipt or sign form */}
        {project.acceptedAt ? (
          <section className="bg-green-50 border border-green-200 rounded-lg p-5">
            <div className="flex items-start gap-3">
              <span className="text-2xl" aria-hidden="true">✓</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-green-900">Proposal accepted</p>
                <p className="text-sm text-green-800 mt-1">
                  Signed by <strong>{project.acceptedBy}</strong> on{" "}
                  {project.acceptedAt.toLocaleString("en-US", {
                    dateStyle: "long",
                    timeStyle: "short",
                  })}
                </p>
                <p className="text-xs text-green-700 mt-2">
                  Thanks — keep this page for your records or download the PDF above.
                </p>
              </div>
            </div>
          </section>
        ) : (
          <section className="bg-surface border-2 border-accent rounded-lg p-5">
            <h2 className="text-sm font-bold uppercase tracking-widest text-foreground mb-3">
              Sign &amp; accept
            </h2>
            <SignForm token={token} action={acceptProposal} />
          </section>
        )}

        <footer className="pt-6 border-t border-border text-center text-xs text-foreground-soft">
          <p>
            Questions? Reply to the email this link came from, or download the PDF for your
            records.
          </p>
          <p className="mt-1">Reliable Remodeling</p>
        </footer>
      </main>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-foreground-muted">{label}</span>
      <span className="text-foreground tabular-nums">{value}</span>
    </div>
  )
}
