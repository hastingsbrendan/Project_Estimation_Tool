"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { formatCurrency } from "@/lib/calc"

const STATUSES = [
  { value: "invited", label: "Invited" },
  { value: "confirmed", label: "Confirmed" },
  { value: "onsite", label: "On site" },
  { value: "done", label: "Done" },
  { value: "cancelled", label: "Cancelled" },
]

export type AssignmentRow = {
  id: string
  scope: string | null
  agreedAmount: number | null
  hourlyRate: number | null
  status: string
  notes: string | null
  startDate: Date | null
  endDate: Date | null
  paidToDate: number
  rated: boolean
  subcontractor: {
    id: string
    name: string
    contactName: string | null
  }
}

export type AvailableSub = {
  id: string
  name: string
  contactName: string | null
}

/**
 * "Subcontractors on this project" panel. Lives entirely client-side
 * because of the typeahead + the inline expand-to-edit rows. All mutations
 * go through the server actions passed in as props.
 *
 * `canRate` flips on once the project status is won/accepted/done — that's
 * when it's worth bothering the contractor to leave a rating. Before then
 * the row's "Rate" button is hidden.
 */
export function ProjectSubsSection({
  projectId,
  assignments,
  availableSubs,
  canRate,
  addAction,
  quickCreateAction,
  updateAction,
  removeAction,
  rateAction,
  logPaymentAction,
}: {
  projectId: string
  assignments: AssignmentRow[]
  availableSubs: AvailableSub[]
  canRate: boolean
  addAction: (
    formData: FormData,
  ) => Promise<{ ok: boolean; error?: string; assignmentId?: string }>
  quickCreateAction: (
    formData: FormData,
  ) => Promise<{ ok: boolean; error?: string; subcontractorId?: string }>
  updateAction: (assignmentId: string, formData: FormData) => Promise<void>
  removeAction: (assignmentId: string) => Promise<void>
  rateAction: (
    subcontractorId: string,
    formData: FormData,
  ) => Promise<{ ok: boolean; error?: string }>
  logPaymentAction: (
    subcontractorId: string,
    formData: FormData,
  ) => Promise<{ ok: boolean; error?: string }>
}) {
  const [adding, setAdding] = useState<"none" | "existing" | "new">("none")
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState("")
  const [expanded, setExpanded] = useState<string | null>(null)
  const [rating, setRating] = useState<string | null>(null) // assignmentId
  const [paying, setPaying] = useState<string | null>(null) // assignmentId

  const assignedIds = new Set(assignments.map((a) => a.subcontractor.id))
  const pickable = availableSubs.filter((s) => !assignedIds.has(s.id))

  return (
    <div className="bg-surface border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-2 bg-surface-muted border-b border-border flex items-baseline justify-between flex-wrap gap-2">
        <p className="text-xs font-medium text-foreground-muted uppercase tracking-wider">
          Subcontractors on this project ({assignments.length})
        </p>
        <div className="flex items-center gap-1.5 text-xs">
          {pickable.length > 0 && (
            <button
              type="button"
              onClick={() => setAdding(adding === "existing" ? "none" : "existing")}
              className="px-2 py-1 bg-surface border border-border rounded hover:bg-accent-soft text-foreground-muted hover:text-foreground"
            >
              {adding === "existing" ? "Cancel" : "+ Add existing"}
            </button>
          )}
          <button
            type="button"
            onClick={() => setAdding(adding === "new" ? "none" : "new")}
            className="px-2 py-1 bg-accent text-white rounded hover:bg-accent-hover"
          >
            {adding === "new" ? "Cancel" : "+ New sub"}
          </button>
        </div>
      </div>

      {adding === "existing" && pickable.length > 0 && (
        <form
          action={(fd) =>
            startTransition(async () => {
              setError("")
              const r = await addAction(fd)
              if (r.ok) {
                setAdding("none")
              } else {
                setError(r.error ?? "Failed")
              }
            })
          }
          className="px-4 py-3 border-b border-border bg-accent-soft/30 flex items-center gap-2 flex-wrap"
        >
          <select
            name="subcontractorId"
            required
            defaultValue=""
            className="flex-1 min-w-48 text-sm border border-border rounded px-3 py-1.5 bg-surface focus:outline-none focus:ring-2 focus:ring-accent"
          >
            <option value="" disabled>
              Pick from your subs…
            </option>
            {pickable.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.contactName ? ` (${s.contactName})` : ""}
              </option>
            ))}
          </select>
          <select
            name="status"
            defaultValue="invited"
            className="text-sm border border-border rounded px-3 py-1.5 bg-surface"
          >
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={pending}
            className="px-3 py-1.5 bg-accent text-white rounded text-sm font-medium hover:bg-accent-hover disabled:opacity-50"
          >
            Assign
          </button>
        </form>
      )}

      {adding === "new" && (
        <form
          action={(fd) =>
            startTransition(async () => {
              setError("")
              const r = await quickCreateAction(fd)
              if (r.ok) {
                setAdding("none")
              } else {
                setError(r.error ?? "Failed")
              }
            })
          }
          className="px-4 py-3 border-b border-border bg-accent-soft/30 grid grid-cols-1 sm:grid-cols-3 gap-2"
        >
          <input
            name="name"
            required
            placeholder="Business / sub name"
            className="text-sm border border-border rounded px-3 py-1.5 bg-surface focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <input
            name="phone"
            type="tel"
            placeholder="Phone (optional)"
            className="text-sm border border-border rounded px-3 py-1.5 bg-surface focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <button
            type="submit"
            disabled={pending}
            className="px-3 py-1.5 bg-accent text-white rounded text-sm font-medium hover:bg-accent-hover disabled:opacity-50"
          >
            Create + assign
          </button>
        </form>
      )}

      {error && (
        <p
          aria-live="polite"
          className="text-sm text-danger bg-red-50 border-b border-red-200 px-4 py-2"
        >
          {error}
        </p>
      )}

      {assignments.length === 0 ? (
        <p className="text-sm text-foreground-soft italic px-4 py-6 text-center">
          No subs assigned yet. Add the plumber, electrician, or framer
          working on this job.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {assignments.map((a) => {
            const isExpanded = expanded === a.id
            return (
              <li key={a.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/subs/${a.subcontractor.id}`}
                      className="text-sm font-medium text-foreground hover:text-accent"
                    >
                      {a.subcontractor.name}
                    </Link>
                    {a.subcontractor.contactName && (
                      <span className="text-xs text-foreground-soft ml-2">
                        ({a.subcontractor.contactName})
                      </span>
                    )}
                    <p className="text-xs text-foreground-muted mt-0.5">
                      {a.scope ?? "No scope set"}
                    </p>
                    <p className="text-[11px] text-foreground-soft mt-0.5 capitalize">
                      Status: <strong>{a.status}</strong>
                      {a.agreedAmount != null && (
                        <>
                          {" · "}
                          <span className="tabular-nums">
                            {formatCurrency(a.agreedAmount)} agreed
                          </span>
                        </>
                      )}
                      {a.hourlyRate != null && (
                        <>
                          {" · "}
                          <span className="tabular-nums">
                            {formatCurrency(a.hourlyRate)}/hr
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                  <div className="text-right text-xs flex flex-col gap-1 items-end">
                    <span className="text-foreground-soft tabular-nums">
                      Paid: {formatCurrency(a.paidToDate)}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setPaying(paying === a.id ? null : a.id)}
                        className="text-xs text-accent hover:underline"
                      >
                        Log payment
                      </button>
                      {canRate && !a.rated && (
                        <button
                          type="button"
                          onClick={() => setRating(rating === a.id ? null : a.id)}
                          className="text-xs text-amber-700 hover:underline"
                        >
                          ⭐ Rate
                        </button>
                      )}
                      {a.rated && (
                        <span className="text-xs text-foreground-soft">Rated ✓</span>
                      )}
                      <button
                        type="button"
                        onClick={() => setExpanded(isExpanded ? null : a.id)}
                        className="text-xs text-foreground-soft hover:text-foreground"
                      >
                        {isExpanded ? "Hide" : "Edit"}
                      </button>
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <EditAssignmentRow
                    assignment={a}
                    updateAction={updateAction}
                    removeAction={removeAction}
                    onClose={() => setExpanded(null)}
                  />
                )}

                {paying === a.id && (
                  <PaymentRow
                    assignmentId={a.id}
                    projectId={projectId}
                    subId={a.subcontractor.id}
                    logPaymentAction={logPaymentAction}
                    onClose={() => setPaying(null)}
                  />
                )}

                {rating === a.id && canRate && (
                  <RatingRow
                    assignmentId={a.id}
                    subId={a.subcontractor.id}
                    rateAction={rateAction}
                    onClose={() => setRating(null)}
                  />
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function EditAssignmentRow({
  assignment,
  updateAction,
  removeAction,
  onClose,
}: {
  assignment: AssignmentRow
  updateAction: (assignmentId: string, formData: FormData) => Promise<void>
  removeAction: (assignmentId: string) => Promise<void>
  onClose: () => void
}) {
  const [pending, startTransition] = useTransition()
  return (
    <div className="mt-3 pt-3 border-t border-border">
      <form
        action={(fd) =>
          startTransition(async () => {
            await updateAction(assignment.id, fd)
            onClose()
          })
        }
        className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm"
      >
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-foreground-muted mb-1">
            Scope
          </label>
          <input
            name="scope"
            defaultValue={assignment.scope ?? ""}
            placeholder="e.g. Plumbing rough + finish"
            className="w-full text-sm border border-border rounded px-3 py-1.5 bg-surface focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-foreground-muted mb-1">
            Agreed amount
          </label>
          <input
            name="agreedAmount"
            type="number"
            step="0.01"
            min={0}
            defaultValue={assignment.agreedAmount ?? ""}
            placeholder="lump-sum"
            className="w-full text-sm border border-border rounded px-3 py-1.5 bg-surface focus:outline-none focus:ring-1 focus:ring-accent tabular-nums"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-foreground-muted mb-1">
            Hourly rate
          </label>
          <input
            name="hourlyRate"
            type="number"
            step="0.01"
            min={0}
            defaultValue={assignment.hourlyRate ?? ""}
            placeholder="alt to lump-sum"
            className="w-full text-sm border border-border rounded px-3 py-1.5 bg-surface focus:outline-none focus:ring-1 focus:ring-accent tabular-nums"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-foreground-muted mb-1">
            Start
          </label>
          <input
            name="startDate"
            type="date"
            defaultValue={
              assignment.startDate
                ? new Date(assignment.startDate).toISOString().slice(0, 10)
                : ""
            }
            className="w-full text-sm border border-border rounded px-3 py-1.5 bg-surface focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-foreground-muted mb-1">
            End
          </label>
          <input
            name="endDate"
            type="date"
            defaultValue={
              assignment.endDate
                ? new Date(assignment.endDate).toISOString().slice(0, 10)
                : ""
            }
            className="w-full text-sm border border-border rounded px-3 py-1.5 bg-surface focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-foreground-muted mb-1">
            Status
          </label>
          <select
            name="status"
            defaultValue={assignment.status}
            className="w-full text-sm border border-border rounded px-3 py-1.5 bg-surface focus:outline-none focus:ring-1 focus:ring-accent"
          >
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-foreground-muted mb-1">
            Notes
          </label>
          <textarea
            name="notes"
            defaultValue={assignment.notes ?? ""}
            rows={2}
            className="w-full text-sm border border-border rounded px-3 py-1.5 bg-surface focus:outline-none focus:ring-1 focus:ring-accent resize-y"
          />
        </div>
        <div className="sm:col-span-2 flex items-center justify-between gap-2 pt-1">
          <button
            type="button"
            onClick={() =>
              startTransition(async () => {
                if (
                  confirm(
                    "Remove this sub from the project? Their payments and ratings will stay on their /subs page.",
                  )
                ) {
                  await removeAction(assignment.id)
                  onClose()
                }
              })
            }
            disabled={pending}
            className="text-xs text-foreground-soft hover:text-danger"
          >
            Remove from project
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="px-3 py-1.5 text-sm border border-border rounded text-foreground-muted hover:bg-surface-muted"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="px-3 py-1.5 bg-accent text-white rounded text-sm font-medium hover:bg-accent-hover disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

function PaymentRow({
  projectId,
  subId,
  logPaymentAction,
  onClose,
}: {
  assignmentId: string
  projectId: string
  subId: string
  logPaymentAction: (
    subcontractorId: string,
    formData: FormData,
  ) => Promise<{ ok: boolean; error?: string }>
  onClose: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState("")
  const today = new Date().toISOString().slice(0, 10)
  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          setError("")
          fd.set("projectId", projectId)
          const r = await logPaymentAction(subId, fd)
          if (r.ok) {
            onClose()
          } else {
            setError(r.error ?? "Failed")
          }
        })
      }
      className="mt-3 pt-3 border-t border-border bg-accent-soft/20 -mx-4 px-4 py-3 grid grid-cols-1 sm:grid-cols-4 gap-2"
    >
      <input
        name="amount"
        type="number"
        step="0.01"
        min={0}
        required
        placeholder="$ amount"
        className="text-sm border border-border rounded px-2 py-1.5 bg-surface tabular-nums"
      />
      <input
        name="paidAt"
        type="date"
        defaultValue={today}
        required
        className="text-sm border border-border rounded px-2 py-1.5 bg-surface"
      />
      <select
        name="method"
        defaultValue="check"
        className="text-sm border border-border rounded px-2 py-1.5 bg-surface"
      >
        <option value="check">Check</option>
        <option value="ach">ACH</option>
        <option value="cash">Cash</option>
        <option value="other">Other</option>
      </select>
      <input
        name="reference"
        placeholder="Check #"
        className="text-sm border border-border rounded px-2 py-1.5 bg-surface"
      />
      {error && (
        <p className="text-xs text-danger sm:col-span-4" aria-live="polite">
          {error}
        </p>
      )}
      <div className="sm:col-span-4 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          disabled={pending}
          className="text-xs text-foreground-soft hover:text-foreground"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="px-3 py-1.5 bg-accent text-white rounded text-xs font-medium hover:bg-accent-hover disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save payment"}
        </button>
      </div>
    </form>
  )
}

function RatingRow({
  subId,
  rateAction,
  onClose,
}: {
  assignmentId: string
  subId: string
  rateAction: (
    subcontractorId: string,
    formData: FormData,
  ) => Promise<{ ok: boolean; error?: string }>
  onClose: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState("")
  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          setError("")
          const r = await rateAction(subId, fd)
          if (r.ok) {
            onClose()
          } else {
            setError(r.error ?? "Failed")
          }
        })
      }
      className="mt-3 pt-3 border-t border-border bg-amber-50 -mx-4 px-4 py-3 space-y-2"
    >
      <p className="text-xs font-medium text-amber-900">
        Rate this sub on four dimensions (1–5). Used to remember who's good
        the next time you bid similar work.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {(
          [
            ["qualityStars", "Quality"],
            ["timelinessStars", "Timeliness"],
            ["communicationStars", "Communication"],
            ["overallStars", "Overall"],
          ] as const
        ).map(([name, label]) => (
          <label key={name} className="text-xs">
            <span className="block text-amber-900 mb-0.5">{label}</span>
            <select
              name={name}
              defaultValue="5"
              required
              className="w-full text-sm border border-amber-300 rounded px-2 py-1 bg-white"
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <textarea
        name="notes"
        rows={2}
        placeholder="What worked, what didn't (optional)"
        className="w-full text-sm border border-amber-300 rounded px-2 py-1 bg-white resize-y"
      />
      {error && (
        <p className="text-xs text-danger" aria-live="polite">
          {error}
        </p>
      )}
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          disabled={pending}
          className="text-xs text-amber-900 hover:text-amber-950"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="px-3 py-1.5 bg-amber-700 text-white rounded text-xs font-medium hover:bg-amber-800 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save rating"}
        </button>
      </div>
    </form>
  )
}
