import { logError } from "./log"

/**
 * Wrap a server action so any unhandled throw is logged with the action's
 * scope before bubbling up. Next.js renders our error.tsx with a hashed
 * digest; the digest itself isn't searchable, but the message and stack we
 * log here are, so logs are how you triage in prod.
 *
 * Usage:
 *   export const myAction = withActionLogging("myAction", async (a, b) => {
 *     // ...
 *   })
 *
 * The wrapped function preserves the same call signature and return type.
 */
export function withActionLogging<TArgs extends unknown[], TReturn>(
  scope: string,
  fn: (...args: TArgs) => Promise<TReturn>,
): (...args: TArgs) => Promise<TReturn> {
  return async (...args: TArgs) => {
    try {
      return await fn(...args)
    } catch (err) {
      logError(scope, err)
      throw err
    }
  }
}

/**
 * Wrap a route handler so any throw is logged before Next renders the
 * route's error response. Same shape as withActionLogging but for the
 * Request → Response signature of route.ts handlers.
 */
export function withRouteLogging<TArgs extends unknown[]>(
  scope: string,
  fn: (...args: TArgs) => Promise<Response>,
): (...args: TArgs) => Promise<Response> {
  return async (...args: TArgs) => {
    try {
      return await fn(...args)
    } catch (err) {
      logError(scope, err)
      throw err
    }
  }
}

/**
 * Strip the parts of a thrown error message that shouldn't reach the user
 * (stack frames, internal paths, raw SQL, etc.). Used by error boundaries
 * to show a useful one-liner without leaking implementation details.
 *
 * Production digests are unsearchable — instead, we surface the FIRST line
 * of the message + a stable hint string, so the contractor knows roughly
 * what went wrong while a real triage still happens via Vercel logs.
 */
export function userFacingErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  const firstLine = raw.split("\n")[0]?.trim() ?? "Unknown error"
  // Some Prisma errors are very long with SQL embedded — keep it short.
  return firstLine.length > 200 ? `${firstLine.slice(0, 200)}…` : firstLine
}
