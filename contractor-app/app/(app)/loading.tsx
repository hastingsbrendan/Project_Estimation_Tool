/**
 * Route-group-level loading skeleton. Before this existed, every
 * navigation on a slow connection (jobsite LTE) rendered a frozen
 * white screen until the server component resolved — which reads as
 * "the app is broken" even when it's just a slow Turso round-trip.
 *
 * Deliberately generic (header bar + list rows) so it's plausible for
 * every page in the (app) group. Pages with very different shapes can
 * add their own loading.tsx to override.
 */
export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse" aria-busy="true" aria-label="Loading">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-6 w-48 bg-surface-muted rounded" />
          <div className="h-3 w-72 bg-surface-muted rounded" />
        </div>
        <div className="h-9 w-28 bg-surface-muted rounded-lg" />
      </div>
      <div className="flex gap-2">
        <div className="h-6 w-16 bg-surface-muted rounded-full" />
        <div className="h-6 w-20 bg-surface-muted rounded-full" />
      </div>
      <div className="bg-surface border border-border rounded-lg divide-y divide-border">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="px-4 py-4 flex items-center justify-between">
            <div className="space-y-2">
              <div className="h-4 w-56 bg-surface-muted rounded" />
              <div className="h-3 w-36 bg-surface-muted rounded" />
            </div>
            <div className="h-4 w-16 bg-surface-muted rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}
