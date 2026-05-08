import Link from "next/link"
import { notFound } from "next/navigation"
import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { calcEstimate, formatCurrency } from "@/lib/calc"
import { AutoSaveForm } from "../auto-form"
import {
  updateProposalContent,
  enableShareLink,
  disableShareLink,
  voidAcceptance,
} from "../actions"
import { SendProposalForm } from "./send-proposal-form"
import { ShareLinkPanel } from "./share-link"
import { sendProposalEmail } from "../proposal-actions"

export default async function ProposalPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await auth()
  if (!session?.user?.email) notFound()
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) notFound()

  const project = await prisma.project.findFirst({
    where: { id, userId: user.id },
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

  const sentRelative = project.proposalSentAt
    ? new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(
        Math.round(
          (project.proposalSentAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
        ),
        "day",
      )
    : null

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/projects/${project.id}`}
          className="text-sm text-foreground-muted hover:text-foreground"
        >
          ← Back to project
        </Link>
        <div className="mt-2 flex items-baseline justify-between flex-wrap gap-3">
          <h1 className="text-xl font-bold text-foreground">{project.name} — Proposal</h1>
          <a
            href={`/api/pdf/proposal/${project.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-foreground-muted hover:text-foreground underline"
          >
            Preview PDF
          </a>
        </div>
        {project.proposalSentAt && (
          <p className="text-xs text-foreground-soft mt-1">
            Last sent {sentRelative} (
            {project.proposalSentAt.toLocaleString("en-US", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
            )
          </p>
        )}
      </div>

      <div className="bg-surface border border-border rounded-lg p-6 space-y-5">
        <AutoSaveForm
          action={updateProposalContent.bind(null, project.id)}
          className="space-y-5"
        >
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Scope of work
            </label>
            <p className="text-xs text-foreground-soft mb-2">
              Plain-English description for the client. Line items in the estimate
              show separately on the PDF.
            </p>
            <textarea
              name="scope"
              defaultValue={project.scope ?? ""}
              rows={5}
              placeholder="e.g. Demo existing kitchen, install new cabinets and quartz countertop, run new electrical for under-cabinet lighting, paint walls and trim."
              className="w-full text-sm text-foreground border border-border rounded px-3 py-2 bg-surface focus:outline-none focus:ring-2 focus:ring-accent resize-y"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Exclusions
            </label>
            <p className="text-xs text-foreground-soft mb-2">
              What is NOT included. Removes ambiguity and protects you on change orders.
            </p>
            <textarea
              name="exclusions"
              defaultValue={project.exclusions ?? ""}
              rows={4}
              placeholder="e.g. Permits, dumpster fees beyond one 10-yard rental, structural changes, asbestos abatement, electrical panel upgrades."
              className="w-full text-sm text-foreground border border-border rounded px-3 py-2 bg-surface focus:outline-none focus:ring-2 focus:ring-accent resize-y"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Payment schedule
            </label>
            <p className="text-xs text-foreground-soft mb-2">
              Terms — deposit, milestones, final payment. One per line.
            </p>
            <textarea
              name="paymentSchedule"
              defaultValue={project.paymentSchedule ?? ""}
              rows={4}
              placeholder={`e.g.\n30% deposit at signing\n40% at rough-in complete\n30% at final walkthrough`}
              className="w-full text-sm text-foreground border border-border rounded px-3 py-2 bg-surface focus:outline-none focus:ring-2 focus:ring-accent resize-y font-mono"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-border">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                Estimated start
              </label>
              <input
                name="estStartWindow"
                defaultValue={project.estStartWindow ?? ""}
                placeholder="e.g. 2 weeks after signing"
                className="w-full text-sm text-foreground border border-border rounded px-2 py-1.5 bg-surface focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                Estimated duration
              </label>
              <input
                name="estDuration"
                defaultValue={project.estDuration ?? ""}
                placeholder="e.g. 3-4 weeks"
                className="w-full text-sm text-foreground border border-border rounded px-2 py-1.5 bg-surface focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                Valid for (days)
              </label>
              <input
                name="validForDays"
                type="number"
                min={1}
                max={365}
                defaultValue={project.validForDays}
                className="w-full text-sm text-foreground border border-border rounded px-2 py-1.5 bg-surface focus:outline-none focus:ring-2 focus:ring-accent tabular-nums"
              />
            </div>
          </div>
        </AutoSaveForm>

        <div className="pt-4 border-t border-border">
          <p className="text-xs text-foreground-soft mb-2">Estimate summary (from line items)</p>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm">
            <div>
              <p className="text-xs text-foreground-soft">Materials</p>
              <p className="font-medium tabular-nums">{formatCurrency(totals.materialSubtotal)}</p>
            </div>
            <div>
              <p className="text-xs text-foreground-soft">Labor</p>
              <p className="font-medium tabular-nums">{formatCurrency(totals.laborSubtotal)}</p>
            </div>
            <div>
              <p className="text-xs text-foreground-soft">Markup</p>
              <p className="font-medium tabular-nums">{formatCurrency(totals.markup)}</p>
            </div>
            <div>
              <p className="text-xs text-foreground-soft">Tax</p>
              <p className="font-medium tabular-nums">{formatCurrency(totals.tax)}</p>
            </div>
            <div className="text-right sm:text-left">
              <p className="text-xs text-foreground-soft">Total</p>
              <p className="text-base font-bold text-accent tabular-nums">
                {formatCurrency(totals.total)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {project.acceptedAt && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-5">
          <div className="flex items-start gap-3">
            <span className="text-xl shrink-0" aria-hidden="true">✓</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-green-900">
                Accepted by {project.acceptedBy}
              </p>
              <p className="text-xs text-green-800 mt-0.5">
                {project.acceptedAt.toLocaleString("en-US", {
                  dateStyle: "long",
                  timeStyle: "short",
                })}
                {project.acceptedIp && (
                  <span className="text-green-700"> · IP {project.acceptedIp}</span>
                )}
              </p>
            </div>
            <form action={voidAcceptance.bind(null, project.id)}>
              <button
                type="submit"
                onClick={(e) => {
                  if (
                    !confirm(
                      `Void the acceptance signed by ${project.acceptedBy}? This is meant for typo corrections — keep the original record otherwise.`,
                    )
                  ) {
                    e.preventDefault()
                  }
                }}
                className="text-xs text-green-700 hover:text-danger transition-colors"
              >
                Void
              </button>
            </form>
          </div>
        </div>
      )}

      <ShareLinkPanel
        projectId={project.id}
        initialToken={project.shareToken}
        enableAction={enableShareLink}
        disableAction={disableShareLink}
      />

      <SendProposalForm
        defaultEmail={project.clientEmail}
        clientName={project.clientName}
        action={sendProposalEmail.bind(null, project.id)}
      />
    </div>
  )
}
