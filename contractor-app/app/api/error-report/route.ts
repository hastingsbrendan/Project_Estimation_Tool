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
 */
export async function POST(req: Request) {
  const session = await auth()
  const userEmail = session?.user?.email
  if (!userEmail) {
    return Response.json({ ok: false, error: "Sign in first" }, { status: 401 })
  }

  let path = "/"
  let message = ""
  try {
    const fd = await req.formData()
    path = String(fd.get("path") ?? "/")
    message = String(fd.get("message") ?? "").slice(0, 4000)
  } catch (e) {
    logError("/api/error-report", e, { userEmail })
    return Response.json({ ok: false, error: "Bad payload" }, { status: 400 })
  }

  // Always log it server-side first — that way even if the webhook is
  // misconfigured we still have the report in Vercel logs.
  logInfo("error-report", `Auto-reported error from ${userEmail}`, {
    userEmail,
    path,
    message,
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
