"use server"

import { auth } from "@/auth"

const MAX_LEN = 4000

/**
 * Send in-app feedback to a configured Discord/Slack webhook. If no webhook
 * is configured, log to the server console (dev-friendly fallback).
 *
 * Configure with FEEDBACK_WEBHOOK_URL — works with both Discord and Slack
 * incoming-webhook URLs since both accept a `{ content: string }` payload
 * (Discord) or we adapt to `{ text: string }` (Slack).
 */
export async function sendFeedback(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth()
  const userEmail = session?.user?.email ?? "unknown@anonymous"

  const message = String(formData.get("message") ?? "").trim()
  const path = String(formData.get("path") ?? "/").trim()
  if (!message) return { ok: false, error: "Please enter a message" }
  if (message.length > MAX_LEN) {
    return { ok: false, error: `Message too long (${MAX_LEN} char max)` }
  }

  const webhook = process.env.FEEDBACK_WEBHOOK_URL
  const isSlack = !!webhook && webhook.includes("hooks.slack.com")

  const payloadLines = [
    `**📝 Feedback** from ${userEmail}`,
    `**Page:** ${path}`,
    `**Message:**`,
    message,
  ]
  const text = payloadLines.join("\n")

  if (!webhook) {
    // Dev fallback: log to the server console so the developer sees it.
    console.log("\n========================================")
    console.log("  IN-APP FEEDBACK")
    console.log(text)
    console.log("========================================\n")
    return { ok: true }
  }

  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(isSlack ? { text } : { content: text }),
    })
    if (!res.ok) {
      const body = await res.text()
      return { ok: false, error: `Webhook send failed (${res.status}): ${body.slice(0, 200)}` }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" }
  }
}
