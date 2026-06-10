/**
 * Loading skeleton for /today — a read-only route with NO form actions.
 *
 * ⚠️ Do NOT add a loading.tsx at the (app) route-group level. We tried
 * (Phase 1) and it silently broke every in-place server-action
 * re-render in the group: the action ran, revalidatePath fired, the
 * RSC response contained the updated tree — but the client never
 * committed it (Next 16.2.5). Forms looked dead; data only appeared
 * after a manual reload. Deterministic, zero console errors.
 *
 * Skeletons are therefore opt-in per route, and only on routes whose
 * interactions are navigations (not revalidate-style form actions).
 */
export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse" aria-busy="true" aria-label="Loading">
      <div className="space-y-2">
        <div className="h-6 w-32 bg-surface-muted rounded" />
        <div className="h-3 w-48 bg-surface-muted rounded" />
      </div>
      {Array.from({ length: 3 }).map((_, s) => (
        <div key={s} className="space-y-2">
          <div className="h-4 w-40 bg-surface-muted rounded" />
          <div className="bg-surface border border-border rounded-lg p-4 space-y-3">
            <div className="h-4 w-3/4 bg-surface-muted rounded" />
            <div className="h-4 w-1/2 bg-surface-muted rounded" />
          </div>
        </div>
      ))}
    </div>
  )
}
