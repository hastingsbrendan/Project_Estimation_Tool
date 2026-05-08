import { auth } from "@/auth"
import { logError, logInfo } from "@/lib/log"

export const runtime = "nodejs"

/**
 * Receives an automated error report from the in-app error boundary
 * (app/(app)/error.tsx). Forwards to FEEDBACK_WEBHOOK_URL so it lands in
 * the same Discord/Slack channel as user feedback, tagged with a [bug]
 * prefix.
 *
 * Auth-light: any signed-in user can report on themselves. We don't accept
 * arbitrary anonymous reports — those would just spam the webhook.
 *
 * Important: this is the only path by which a server-component render
 * error becomes findable in Vercel logs. Next.js wraps server-component
 * errors in production with a generic outer message ("An error occurred
 * in the Server Components render…"), and the digest is computed from
 * that wrapper — so 100% of server-component crashes look identical via
 * digest alone. The auto-report fires from the error boundary on mount
 * with the path and digest so we can correlate to the timestamp in the
 * function logs.
 */
export async function POST(req: Request) {
  const session = await auth()
  const userEmail = session?.user?.email
  if (!userEmail) {
    return Response.json({ ok: false, error: "Sign in first" }, { status: 401 })
  }

  let path = "/"
  let message = ""
  let digest = ""
  let auto = false
  try {
    const fd = await req.formData()
    path = String(fd.get("path") ?? "/")
    message = String(fd.get("message") ?? "").slice(0, 4000)
    digest = String(fd.get("digest") ?? "")
    auto = String(fd.get("auto") ?? "") === "1"
  } catch (e) {
    logError("/api/error-report", e, { userEmail })
    return Response.json({ ok: false, error: "Bad payload" }, { status: 400 })
  }

  // Emit as an ERROR-level log line (not info) so it's findable in Vercel's
  // log-level filter. The error message we re-throw is purely synthetic —
  // it carries the digest + path + user so a future `vercel logs --filter
  // "error-boundary"` finds the entry instantly.
  logError(
    "error-boundary",
    new Error(
      `client_error_boundary: ${path} digest=${digest || "(none)"} ${auto ? "auto" : "manual"}`,
    ),
    { userEmail, path, digest, auto, message },
  )
  logInfo("error-report", `Reported error from ${userEmail}`, {
    userEmail,
    path,
    digest,
    auto,
  })

  const webhook = process.env.FEEDBACK_WEBHOOK_URL
  if (!webhook) return Response.json({ ok: true })

  const isSlack = webhook.includes("hooks.slack.com")
  const text = [
    `**🐛 Auto-reported error** from ${userEmail}`,
    `**Path:** ${path}`,
    "```",
    message,
    "```",
  ].join("\n")
  try {
    await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(isSlack ? { text } : { content: text }),
    })
  } catch (e) {
    logError("/api/error-report.webhook", e, { userEmail })
    return Response.json({ ok: false, error: "Webhook send failed" }, { status: 502 })
  }

  return Response.json({ ok: true })
}
