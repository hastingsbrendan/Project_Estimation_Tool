/**
 * Structured logger. Vercel parses JSON-shaped log lines and lets you filter
 * by any field, so emit one JSON object per log entry. The `scope` is the
 * thing that makes a log line easy to find later — always set it to a stable
 * string identifying the action / route, e.g. "uploadReceipt" or
 * "/api/pdf/proposal".
 *
 * In production each log line is a single JSON object, parseable by Vercel
 * (or `jq` if you `vercel logs`). In dev it's pretty-printed for readability.
 *
 * Triage flow:
 *  1. User reports "ERROR <digest>" from a page error
 *  2. Open Vercel → Deployments → Functions → Logs
 *  3. Search for the scope or part of the error message
 *  4. The matching log line includes the stack trace and any context fields
 *     (userId, route, file size, etc.)
 *
 * See TRIAGE.md for the full runbook.
 */

type LogLevel = "info" | "warn" | "error"

type LogContext = Record<string, unknown>

const isProd = process.env.NODE_ENV === "production"

function emit(level: LogLevel, scope: string, message: string, context?: LogContext) {
  const entry = {
    level,
    scope,
    message,
    timestamp: new Date().toISOString(),
    ...context,
  }
  if (isProd) {
    // One-line JSON so Vercel's log search treats the whole entry as one row.
    const out = JSON.stringify(entry)
    if (level === "error") console.error(out)
    else if (level === "warn") console.warn(out)
    else console.log(out)
  } else {
    // Dev: human-readable so you can grep the terminal.
    const prefix = `[${level.toUpperCase()}] ${scope}`
    if (level === "error") console.error(prefix, message, context ?? "")
    else if (level === "warn") console.warn(prefix, message, context ?? "")
    else console.log(prefix, message, context ?? "")
  }
}

export function logInfo(scope: string, message: string, context?: LogContext) {
  emit("info", scope, message, context)
}

export function logWarn(scope: string, message: string, context?: LogContext) {
  emit("warn", scope, message, context)
}

/**
 * Log an error with full stack + context. Always pass the original error
 * object — we extract the message and stack so a search by either works.
 */
export function logError(scope: string, error: unknown, context?: LogContext) {
  const err = error instanceof Error ? error : new Error(String(error))
  emit("error", scope, err.message, {
    ...context,
    errorName: err.name,
    stack: err.stack,
  })
}
