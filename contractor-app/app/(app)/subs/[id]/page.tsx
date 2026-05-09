import Link from "next/link"
import { notFound } from "next/navigation"
import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { formatCurrency } from "@/lib/calc"
import { isPiiKeyConfigured } from "@/lib/crypto/secret-box"
import { WarningChip } from "@/components/ui/warning-chip"
import { AutoSaveForm } from "../../projects/[id]/auto-form"
import { ConfirmSubmitButton } from "../../confirm-submit-button"
import {
  updateSubcontractor,
  archiveSubcontractor,
  unarchiveSubcontractor,
  deleteSubcontractor,
  setTaxId,
  unsetTaxId,
  addSpecialty,
  removeSpecialty,
} from "../actions"
import { addPayment, deletePayment } from "../payment-actions"
import { TaxIdField } from "./tax-id-field"
import { SpecialtyChips } from "./specialty-chips"
import { LogPaymentForm } from "./log-payment-form"
import { logError } from "@/lib/log"

export default async function SubcontractorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  let detail: Awaited<ReturnType<typeof loadDetail>>
  try {
    detail = await loadDetail(id)
  } catch (e) {
    logError("/subs/[id]", e, { subcontractorId: id })
    throw e
  }
  if (!detail.found) notFound()
  const { sub, projects, specialties, projectsForPayment } = detail

  const yearStart = new Date(new Date().getFullYear(), 0, 1)
  const ytd = sub.payments
    .filter((p) => p.paidAt >= yearStart)
    .reduce((sum, p) => sum + p.amount, 0)
  const eligibleFor1099 = ytd >= 600 && !sub.isCorporation
  const missingTaxId = eligibleFor1099 && !sub.taxIdEncrypted

  const piiConfigured = isPiiKeyConfigured()

  const avgStars =
    sub.ratings.length > 0
      ? sub.ratings.reduce((s, r) => s + r.overallStars, 0) / sub.ratings.length
      : null

  return (
    <div className="space-y-6">
      <div>
        <Link href="/subs" className="text-sm text-foreground-muted hover:text-foreground">
          ← All subs
        </Link>
        <div className="flex items-baseline justify-between flex-wrap gap-3 mt-2">
          <h1 className="text-xl font-bold text-foreground">{sub.name}</h1>
          <div className="flex items-center gap-3 text-xs">
            {avgStars != null && (
              <span className="tabular-nums">⭐ {avgStars.toFixed(1)} avg</span>
            )}
            <span className="text-foreground-soft">
              YTD <strong className="text-foreground tabular-nums">{formatCurrency(ytd)}</strong>
            </span>
            {eligibleFor1099 && (
              <WarningChip
                tone={missingTaxId ? "danger" : "warning"}
                size="sm"
                className="rounded-full"
              >
                {missingTaxId ? "⚠ 1099 — tax ID missing" : "1099 eligible"}
              </WarningChip>
            )}
            {sub.archived && (
              <span className="px-2 py-0.5 rounded-full bg-surface-muted text-foreground-soft">
                Archived
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Profile */}
      <div className="bg-surface border border-border rounded-lg p-5 space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Profile</h2>
        <AutoSaveForm
          action={updateSubcontractor.bind(null, sub.id)}
          className="grid grid-cols-1 sm:grid-cols-2 gap-4"
        >
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-foreground-muted mb-1">
              Business / sub name
            </label>
            <input
              name="name"
              defaultValue={sub.name}
              required
              className="w-full text-sm border border-border rounded px-3 py-2 bg-surface focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground-muted mb-1">
              Contact name
            </label>
            <input
              name="contactName"
              defaultValue={sub.contactName ?? ""}
              className="w-full text-sm border border-border rounded px-3 py-2 bg-surface focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground-muted mb-1">
              Phone
            </label>
            <input
              name="phone"
              type="tel"
              defaultValue={sub.phone ?? ""}
              className="w-full text-sm border border-border rounded px-3 py-2 bg-surface focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground-muted mb-1">
              Email
            </label>
            <input
              name="email"
              type="email"
              defaultValue={sub.email ?? ""}
              className="w-full text-sm border border-border rounded px-3 py-2 bg-surface focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground-muted mb-1">
              Address
            </label>
            <input
              name="address"
              defaultValue={sub.address ?? ""}
              className="w-full text-sm border border-border rounded px-3 py-2 bg-surface focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="flex items-start gap-2 text-xs text-foreground-muted cursor-pointer select-none">
              <input
                type="checkbox"
                name="isCorporation"
                value="1"
                defaultChecked={sub.isCorporation}
                className="mt-0.5 accent-accent"
              />
              <span>
                This is a corporation (S-corp, C-corp, or LLC taxed as a corp).
                Corporations are exempt from 1099-NEC reporting.
              </span>
            </label>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-foreground-muted mb-1">
              Notes
            </label>
            <textarea
              name="notes"
              defaultValue={sub.notes ?? ""}
              rows={3}
              placeholder="e.g. great trim work, slow on punchlist, prefers Tuesday starts"
              className="w-full text-sm border border-border rounded px-3 py-2 bg-surface focus:outline-none focus:ring-2 focus:ring-accent resize-y"
            />
          </div>
        </AutoSaveForm>

        <div>
          <label className="block text-xs font-medium text-foreground-muted mb-2">
            Specialties
          </label>
          <SpecialtyChips
            current={sub.specialties.map((ss) => ({
              id: ss.specialty.id,
              label: ss.specialty.label,
            }))}
            options={specialties.map((s) => ({ id: s.id, label: s.label }))}
            addAction={addSpecialty.bind(null, sub.id)}
            removeAction={removeSpecialty.bind(null, sub.id)}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-foreground-muted mb-2">
            Tax ID (SSN or EIN)
          </label>
          <TaxIdField
            last4={sub.taxIdLast4}
            hasValue={!!sub.taxIdEncrypted}
            lockedReason={
              piiConfigured
                ? null
                : "SUBCONTRACTOR_PII_KEY env var is not set, so tax IDs can't be encrypted. The 1099 page will also be disabled until the key is configured."
            }
            setAction={setTaxId.bind(null, sub.id)}
            unsetAction={unsetTaxId.bind(null, sub.id)}
          />
        </div>
      </div>

      {/* History */}
      <div className="bg-surface border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-2 bg-surface-muted border-b border-border">
          <p className="text-xs font-medium text-foreground-muted uppercase tracking-wider">
            Project history ({sub.assignments.length})
          </p>
        </div>
        {sub.assignments.length === 0 ? (
          <p className="text-sm text-foreground-soft italic px-4 py-6 text-center">
            Not assigned to any projects yet. Add this sub from a project&rsquo;s
            page to track their work.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {sub.assignments.map((a) => {
              const rating = sub.ratings.find((r) => r.projectId === a.projectId)
              const projectPaid = sub.payments
                .filter((p) => p.projectId === a.projectId)
                .reduce((s, p) => s + p.amount, 0)
              return (
                <li key={a.id} className="px-4 py-3 hover:bg-surface-muted/50 transition-colors">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <Link
                        href={`/projects/${a.project.id}`}
                        className="text-sm font-medium text-foreground hover:text-accent"
                      >
                        {a.project.name}
                      </Link>
                      {a.scope && (
                        <p className="text-xs text-foreground-muted mt-0.5 truncate">
                          {a.scope}
                        </p>
                      )}
                      <p className="text-xs text-foreground-soft mt-0.5">
                        Status: {a.status}
                        {a.startDate && ` · started ${a.startDate.toLocaleDateString("en-US")}`}
                      </p>
                    </div>
                    <div className="text-right text-xs">
                      <div className="tabular-nums text-foreground">
                        {a.agreedAmount != null
                          ? `${formatCurrency(a.agreedAmount)} agreed`
                          : a.hourlyRate != null
                            ? `${formatCurrency(a.hourlyRate)}/hr`
                            : "—"}
                      </div>
                      <div className="text-foreground-soft tabular-nums">
                        Paid: {formatCurrency(projectPaid)}
                      </div>
                      {rating && (
                        <div className="text-foreground-soft mt-0.5">
                          ⭐ {rating.overallStars}
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Payments */}
      <div className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-foreground">
            Payments ({sub.payments.length})
          </h2>
          <p className="text-xs text-foreground-soft tabular-nums">
            YTD: <strong className="text-foreground">{formatCurrency(ytd)}</strong>
          </p>
        </div>

        <LogPaymentForm
          projects={projectsForPayment}
          action={addPayment.bind(null, sub.id)}
        />

        {sub.payments.length === 0 ? (
          <p className="text-sm text-foreground-soft italic px-4 py-3 text-center bg-surface border border-border rounded-lg">
            No payments logged yet.
          </p>
        ) : (
          <div className="bg-surface border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-foreground-soft uppercase tracking-wider bg-surface-muted">
                  <th className="text-left px-4 py-2">Date</th>
                  <th className="text-left px-4 py-2">Method</th>
                  <th className="text-left px-4 py-2">Project</th>
                  <th className="text-left px-4 py-2">Reference</th>
                  <th className="text-right px-4 py-2">Amount</th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sub.payments.map((p) => {
                  const project = projects.find((proj) => proj.id === p.projectId)
                  return (
                    <tr key={p.id} className="group hover:bg-surface-muted/40">
                      <td className="px-4 py-2 tabular-nums text-foreground">
                        {p.paidAt.toLocaleDateString("en-US")}
                      </td>
                      <td className="px-4 py-2 capitalize text-foreground-muted">
                        {p.method}
                      </td>
                      <td className="px-4 py-2 text-foreground-muted">
                        {project ? (
                          <Link
                            href={`/projects/${project.id}`}
                            className="hover:text-accent"
                          >
                            {project.name}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-2 text-foreground-soft">
                        {p.reference ?? "—"}
                      </td>
                      <td className="px-4 py-2 tabular-nums text-right text-foreground font-medium">
                        {formatCurrency(p.amount)}
                      </td>
                      <td className="px-2 py-2">
                        <form action={deletePayment.bind(null, p.id)}>
                          <ConfirmSubmitButton
                            confirmText="Delete this payment? This can't be undone."
                            className="text-xs text-foreground-soft opacity-0 group-hover:opacity-100 hover:text-danger transition-all"
                          >
                            ✕
                          </ConfirmSubmitButton>
                        </form>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="flex items-center gap-3 justify-end pt-3 border-t border-border">
        {sub.archived ? (
          <form action={unarchiveSubcontractor.bind(null, sub.id)}>
            <button
              type="submit"
              className="text-xs text-foreground-muted hover:text-foreground"
            >
              Unarchive
            </button>
          </form>
        ) : (
          <form action={archiveSubcontractor.bind(null, sub.id)}>
            <button
              type="submit"
              className="text-xs text-foreground-muted hover:text-foreground"
            >
              Archive
            </button>
          </form>
        )}
        <form action={deleteSubcontractor.bind(null, sub.id)}>
          <ConfirmSubmitButton
            confirmText={`Delete ${sub.name}? This will also remove their payment + rating history. Use Archive instead if you might want it later.`}
            className="text-xs text-foreground-soft hover:text-danger"
          >
            Delete
          </ConfirmSubmitButton>
        </form>
      </div>
    </div>
  )
}

async function loadDetail(id: string) {
  const session = await auth()
  if (!session?.user?.email) return { found: false } as const
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return { found: false } as const

  const sub = await prisma.subcontractor.findFirst({
    where: { id, userId: user.id },
    include: {
      specialties: { include: { specialty: true } },
      assignments: {
        include: { project: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
      },
      payments: { orderBy: { paidAt: "desc" } },
      ratings: true,
    },
  })
  if (!sub) return { found: false } as const

  // Specialty options: defaults + this user's customs.
  const specialties = await prisma.specialty.findMany({
    where: { OR: [{ isDefault: true }, { userId: user.id }] },
    orderBy: { label: "asc" },
  })

  // Projects, for the payment-form dropdown + cross-references in the table.
  const projects = await prisma.project.findMany({
    where: { userId: user.id },
    select: { id: true, name: true },
    orderBy: { updatedAt: "desc" },
  })

  return {
    found: true as const,
    sub,
    projects,
    projectsForPayment: projects,
    specialties,
  }
}
