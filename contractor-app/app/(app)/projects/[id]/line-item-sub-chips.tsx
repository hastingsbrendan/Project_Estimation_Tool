"use client"

import Link from "next/link"
import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"

export type AssignedSub = { subId: string; name: string }
export type AvailableSub = { id: string; name: string }

/**
 * Per-service-line-item assignment chips + completion checkbox.
 *
 * Lives BELOW the LineItemRow's AutoSaveForm (not inside it) so the
 * picker's blur events don't trip updateLineItem. All mutations are
 * server actions passed in as props; this component is purely view +
 * dispatch.
 *
 * The completed state is held on LineItem itself, not on the join — a
 * service is done or it isn't, regardless of who's on it. We pass `done`
 * explicitly to the toggle action so a double-click doesn't oscillate
 * between the optimistic state and a stale read.
 */
export function LineItemSubChips({
  projectId,
  lineItemId,
  completedAt,
  assignments,
  availableSubs,
  assignAction,
  unassignAction,
  toggleCompleteAction,
}: {
  projectId: string
  lineItemId: string
  completedAt: Date | null
  assignments: AssignedSub[]
  availableSubs: AvailableSub[]
  assignAction: (
    lineItemId: string,
    subId: string,
  ) => Promise<{ ok: boolean; error?: string }>
  unassignAction: (
    lineItemId: string,
    subId: string,
  ) => Promise<{ ok: boolean; error?: string }>
  toggleCompleteAction: (
    lineItemId: string,
    done: boolean,
  ) => Promise<{ ok: boolean; error?: string }>
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [picking, setPicking] = useState(false)
  const [error, setError] = useState("")

  const serverIsDone = completedAt != null
  // Local optimistic state — flips immediately on click so the UI feels
  // instant and Playwright's .check() can verify state synchronously.
  // Re-syncs whenever the server prop changes (after router.refresh).
  const [isDone, setIsDone] = useState(serverIsDone)
  useEffect(() => {
    setIsDone(serverIsDone)
  }, [serverIsDone])
  const assignedIds = new Set(assignments.map((a) => a.subId))
  const pickable = availableSubs.filter((s) => !assignedIds.has(s.id))
  const noSubsAtAll = availableSubs.length === 0

  function withTransition(fn: () => Promise<{ ok: boolean; error?: string }>) {
    startTransition(async () => {
      setError("")
      const r = await fn()
      if (!r.ok) setError(r.error ?? "Failed")
      router.refresh()
    })
  }

  return (
    <div
      className="px-2 pb-2 -mt-1 flex items-center gap-2 flex-wrap text-xs text-foreground-soft"
      data-line-item-id={lineItemId}
      data-completed={isDone ? "1" : "0"}
    >
      <label className="inline-flex items-center gap-1 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={isDone}
          onChange={(e) => {
            const next = e.target.checked
            setIsDone(next) // optimistic flip
            startTransition(async () => {
              setError("")
              const r = await toggleCompleteAction(lineItemId, next)
              if (!r.ok) {
                setIsDone(!next) // revert
                setError(r.error ?? "Failed")
                return
              }
              router.refresh()
            })
          }}
          className="accent-accent"
          aria-label="Mark service complete"
        />
        <span className={isDone ? "text-success" : "text-foreground-soft"}>
          {isDone ? "Done" : "To do"}
        </span>
      </label>

      <span className="text-foreground-soft" aria-hidden="true">
        ·
      </span>

      {assignments.length === 0 && !picking && (
        <span className="text-foreground-soft italic">No subs assigned</span>
      )}

      {assignments.map((a) => (
        <span
          key={a.subId}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent-soft text-foreground"
        >
          <Link href={`/subs/${a.subId}`} className="hover:underline">
            {a.name}
          </Link>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              withTransition(() => unassignAction(lineItemId, a.subId))
            }
            className="text-foreground-soft hover:text-danger disabled:opacity-50"
            aria-label={`Unassign ${a.name}`}
            title={`Unassign ${a.name}`}
          >
            ✕
          </button>
        </span>
      ))}

      {!picking && pickable.length > 0 && (
        <button
          type="button"
          onClick={() => {
            setPicking(true)
            setError("")
          }}
          className="text-foreground-muted hover:text-foreground border border-dashed border-border rounded-full px-2 py-0.5"
        >
          + assign
        </button>
      )}

      {picking && pickable.length > 0 && (
        <span className="inline-flex items-center gap-1.5">
          <select
            autoFocus
            disabled={pending}
            defaultValue=""
            onChange={(e) => {
              const v = e.currentTarget.value
              if (!v) return
              setPicking(false)
              withTransition(() => assignAction(lineItemId, v))
            }}
            className="text-xs border border-border rounded px-2 py-0.5 bg-surface focus:outline-none focus:ring-1 focus:ring-accent"
          >
            <option value="" disabled>
              Pick a sub…
            </option>
            {pickable.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              setPicking(false)
              setError("")
            }}
            className="text-foreground-soft hover:text-foreground"
          >
            cancel
          </button>
        </span>
      )}

      {noSubsAtAll && (
        <Link
          href="/subs"
          className="text-accent hover:underline"
          title="Add a subcontractor first"
        >
          Add a sub →
        </Link>
      )}

      {error && (
        <span aria-live="polite" className="text-danger">
          {error}
        </span>
      )}
    </div>
  )
}
