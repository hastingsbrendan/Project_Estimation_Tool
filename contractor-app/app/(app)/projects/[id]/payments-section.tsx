import { formatCurrency } from "@/lib/calc"
import { Card } from "@/components/ui/card"
import { WarningChip } from "@/components/ui/warning-chip"
import { AutoSaveForm } from "./auto-form"
import { ConfirmSubmitButton } from "../../confirm-submit-button"
import {
  addMilestone,
  deleteMilestone,
  generateMilestonesFromSchedule,
  toggleMilestonePaid,
  updateMilestone,
} from "./payment-actions"

/**
 * Payments + job P&L — the post-acceptance spine. Two cards:
 *
 *  1. Job financials: estimate vs actuals (receipts + sub payments) →
 *     realized margin, plus collected vs outstanding from milestones.
 *  2. Payment milestones: generated from the freeform paymentSchedule
 *     text or hand-added. Each row → invoice PDF + paid toggle.
 *
 * Server component — all interactions are server-action forms, matching
 * the rest of the project page.
 */

export type MilestoneView = {
  id: string
  label: string
  amount: number
  invoicedAt: Date | null
  paidAt: Date | null
}

export function PaymentsSection({
  projectId,
  estimateTotal,
  receiptsTotal,
  subPaymentsTotal,
  milestones,
  hasPaymentScheduleText,
}: {
  projectId: string
  estimateTotal: number
  receiptsTotal: number
  subPaymentsTotal: number
  milestones: MilestoneView[]
  hasPaymentScheduleText: boolean
}) {
  const actuals = receiptsTotal + subPaymentsTotal
  const margin = estimateTotal - actuals
  const marginPct = estimateTotal > 0 ? (margin / estimateTotal) * 100 : null

  const collected = milestones
    .filter((m) => m.paidAt)
    .reduce((s, m) => s + m.amount, 0)
  const outstanding = milestones
    .filter((m) => !m.paidAt)
    .reduce((s, m) => s + m.amount, 0)
  const scheduled = collected + outstanding

  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold text-foreground">Money</h2>

      {/* Job P&L */}
      <Card size="compact">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div>
            <p className="text-xs text-foreground-soft">Estimate</p>
            <p className="font-medium tabular-nums text-foreground">
              {formatCurrency(estimateTotal)}
            </p>
          </div>
          <div>
            <p className="text-xs text-foreground-soft">
              Spent so far
              <span className="hidden sm:inline"> (receipts + subs)</span>
            </p>
            <p className="font-medium tabular-nums text-foreground">
              {formatCurrency(actuals)}
            </p>
            <p className="text-[10px] text-foreground-soft tabular-nums">
              {formatCurrency(receiptsTotal)} materials · {formatCurrency(subPaymentsTotal)} subs
            </p>
          </div>
          <div>
            <p className="text-xs text-foreground-soft">Margin if on budget</p>
            <p
              className={`font-semibold tabular-nums ${margin < 0 ? "text-danger" : "text-foreground"}`}
            >
              {formatCurrency(margin)}
              {marginPct != null && (
                <span className="text-xs text-foreground-soft font-normal">
                  {" "}
                  ({marginPct.toFixed(0)}%)
                </span>
              )}
            </p>
          </div>
          <div>
            <p className="text-xs text-foreground-soft">Collected</p>
            <p className="font-medium tabular-nums text-foreground">
              {formatCurrency(collected)}
              {outstanding > 0 && (
                <span className="text-xs text-foreground-soft font-normal">
                  {" "}
                  / {formatCurrency(outstanding)} open
                </span>
              )}
            </p>
          </div>
        </div>
      </Card>

      {/* Milestones */}
      <Card size="compact" className="space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-sm font-semibold text-foreground">Payment milestones</p>
          {milestones.length === 0 && hasPaymentScheduleText && (
            <form action={generateMilestonesFromSchedule.bind(null, projectId)}>
              <button
                type="submit"
                className="text-xs px-3 py-1.5 bg-accent text-white rounded-md font-medium hover:bg-accent-hover"
                title="Parse the payment schedule text from Proposal content into milestone rows"
              >
                ⚡ Generate from payment schedule
              </button>
            </form>
          )}
        </div>

        {milestones.length === 0 ? (
          <p className="text-xs text-foreground-soft">
            No milestones yet.{" "}
            {hasPaymentScheduleText
              ? "Generate them from your payment schedule, or add one below."
              : "Write a payment schedule in the proposal content (e.g. “30% deposit, 40% rough-in, 30% final”) or add milestones by hand below."}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {milestones.map((m) => (
              <li
                key={m.id}
                className="py-2 grid grid-cols-12 gap-2 items-center text-sm"
              >
                <form action={toggleMilestonePaid.bind(null, projectId, m.id)} className="col-span-1">
                  <button
                    type="submit"
                    title={m.paidAt ? "Mark unpaid" : "Mark paid"}
                    className={`w-5 h-5 rounded border text-[11px] leading-none ${
                      m.paidAt
                        ? "bg-success border-success text-white"
                        : "bg-surface border-border text-transparent hover:border-accent"
                    }`}
                  >
                    ✓
                  </button>
                </form>
                <AutoSaveForm
                  action={updateMilestone.bind(null, projectId, m.id)}
                  className="col-span-7 sm:col-span-8 grid grid-cols-12 gap-2 items-center"
                >
                  <input
                    name="label"
                    defaultValue={m.label}
                    className={`col-span-8 bg-transparent border-b border-transparent hover:border-border focus:border-accent focus:outline-none px-1 py-0.5 -mx-1 ${
                      m.paidAt ? "line-through text-foreground-soft" : "text-foreground"
                    }`}
                  />
                  <div className="col-span-4 relative">
                    <span className="pointer-events-none absolute left-1 top-1/2 -translate-y-1/2 text-foreground-soft text-xs">
                      $
                    </span>
                    <input
                      name="amount"
                      type="number"
                      step="0.01"
                      min="0"
                      defaultValue={m.amount}
                      className="w-full bg-transparent border-b border-transparent hover:border-border focus:border-accent focus:outline-none pl-4 pr-1 py-0.5 tabular-nums text-right text-foreground"
                    />
                  </div>
                </AutoSaveForm>
                <div className="col-span-4 sm:col-span-3 flex items-center justify-end gap-2 text-xs">
                  {m.paidAt ? (
                    <span className="text-success whitespace-nowrap" title={`Paid ${m.paidAt.toLocaleDateString()}`}>
                      Paid {m.paidAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                  ) : (
                    <>
                      <a
                        href={`/api/pdf/invoice/${m.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-accent hover:underline whitespace-nowrap"
                        title={m.invoicedAt ? "Re-download invoice" : "Generate invoice PDF"}
                      >
                        {m.invoicedAt ? "Invoice ↗" : "🧾 Invoice"}
                      </a>
                      {m.invoicedAt && (
                        <WarningChip title={`Invoiced ${m.invoicedAt.toLocaleDateString()} — awaiting payment`}>
                          unpaid
                        </WarningChip>
                      )}
                    </>
                  )}
                  <form action={deleteMilestone.bind(null, projectId, m.id)}>
                    <ConfirmSubmitButton
                      confirmText={`Delete milestone "${m.label}"?`}
                      className="text-foreground-soft hover:text-danger"
                    >
                      ✕
                    </ConfirmSubmitButton>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Add milestone */}
        <form
          action={addMilestone.bind(null, projectId)}
          className="flex items-end gap-2 pt-2 border-t border-border"
        >
          <div className="flex-1">
            <label className="block text-[10px] uppercase tracking-wider text-foreground-soft mb-0.5">
              New milestone
            </label>
            <input
              name="label"
              required
              placeholder="e.g. Drywall complete"
              className="w-full border border-border rounded px-2 py-1.5 text-sm bg-surface focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <div className="w-28">
            <label className="block text-[10px] uppercase tracking-wider text-foreground-soft mb-0.5">
              Amount
            </label>
            <input
              name="amount"
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              className="w-full border border-border rounded px-2 py-1.5 text-sm bg-surface tabular-nums text-right focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <button
            type="submit"
            className="px-3 py-1.5 bg-accent text-white rounded text-sm font-medium hover:bg-accent-hover"
          >
            Add
          </button>
        </form>

        {milestones.length > 0 && Math.abs(scheduled - estimateTotal) > 1 && estimateTotal > 0 && (
          <p className="text-[10px] text-foreground-soft">
            Scheduled {formatCurrency(scheduled)} vs estimate {formatCurrency(estimateTotal)} —
            adjust amounts if the job total changed.
          </p>
        )}
      </Card>
    </section>
  )
}
