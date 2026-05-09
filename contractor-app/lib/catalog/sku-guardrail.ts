/**
 * SKU write guardrail for the receipt → catalog feedback loop.
 *
 * The contract:
 *   - `existing` is the SKU currently saved on the catalog row (or null).
 *   - `requested` is the SKU the receipt-update flow wants to write.
 *
 * Returns:
 *   - the SKU string to write (when the write is safe), OR
 *   - undefined (skip the write, preserve existing).
 *
 * Rules — protect user-entered data:
 *   1. Empty / whitespace-only requested → skip. The caller already
 *      filters this case but we double-check.
 *   2. No existing SKU → write requested (the bucket is empty, fill it).
 *   3. Existing SKU equals requested (after trim) → write requested
 *      (technically a no-op, but harmless and simpler than branching).
 *   4. Existing SKU differs from requested → SKIP. The review UI is
 *      responsible for surfacing conflicts so the user can pick
 *      "overwrite" explicitly. By the time a decision arrives in
 *      applyCatalogUpdates, we trust the UI's intent — but we
 *      defense-in-depth here so a malformed decision can't silently
 *      destroy a user-entered SKU.
 */
export function decideHdSkuWrite(args: {
  existing: string | null
  requested: string | null | undefined
}): string | undefined {
  const requested = (args.requested ?? "").trim()
  if (!requested) return undefined
  const existing = (args.existing ?? "").trim()
  if (!existing) return requested
  if (existing === requested) return requested
  return undefined
}
