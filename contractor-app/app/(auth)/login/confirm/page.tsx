import Link from "next/link"
import { logInfo } from "@/lib/log"

/**
 * Magic-link interstitial page.
 *
 * Why this exists: corporate / consumer email scanners (Gmail Safe
 * Browsing, Microsoft Safe Links, Proofpoint, Mimecast, etc.) issue a
 * server-side GET against URLs in incoming mail to scan them for
 * malware *before* the recipient ever sees the message. Auth.js's
 * default magic-link callback at `/api/auth/callback/<provider>?token=…`
 * consumes the single-use verification token on any GET — so by the
 * time the real user taps the link in their email client, the token
 * is already burned and they hit a generic "Something went wrong"
 * error.
 *
 * Mitigation: we send users to *this* page instead of straight to the
 * Auth.js callback. This page does NOT consume the token; it just
 * server-renders a confirmation button. The button is a plain `<a>` to
 * the real callback URL — link scanners typically don't follow
 * click-through links rendered inside an interstitial, so the token
 * survives until the real user actually taps.
 *
 * If a scanner does follow it, the user lands back at /login?error=1
 * exactly like before, so we're never worse off than the original
 * behavior — just better in the common case.
 *
 * Server component (no "use client") because we don't need any
 * client-side interactivity. Adds an audit log line so we can see
 * scanner hits vs. user hits in /api/health logs over time.
 */

const SCOPE = "/login/confirm"

export default async function ConfirmSignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const token = typeof sp.token === "string" ? sp.token : ""
  const email = typeof sp.email === "string" ? sp.email : ""
  const callbackUrl = typeof sp.callbackUrl === "string" ? sp.callbackUrl : "/projects"

  // Log the hit so we can correlate scanner traffic vs human traffic
  // and see how often this fix is actually saving sessions.
  logInfo(SCOPE, "Magic-link interstitial rendered", {
    hasToken: Boolean(token),
    emailDomain: email.includes("@") ? email.split("@")[1] : null,
  })

  if (!token || !email) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-surface rounded-2xl shadow-sm border border-border p-8 text-center">
          <div className="text-4xl mb-3">⚠️</div>
          <h1 className="text-lg font-semibold text-foreground mb-2">
            Invalid sign-in link
          </h1>
          <p className="text-sm text-foreground-muted mb-6">
            This link is missing the information needed to sign you in. Try
            requesting a new one.
          </p>
          <Link
            href="/login"
            className="inline-block bg-accent text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors"
          >
            Back to sign-in
          </Link>
        </div>
      </div>
    )
  }

  // Build the *actual* callback URL that consumes the token. We
  // pass through the original query params unchanged.
  const callbackParams = new URLSearchParams({
    token,
    email,
    callbackUrl,
  })
  const consumeUrl = `/api/auth/callback/nodemailer?${callbackParams.toString()}`

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-surface rounded-2xl shadow-sm border border-border p-8 text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 bg-accent rounded-xl mb-4 shadow-sm">
          <span className="text-white text-lg">🔨</span>
        </div>
        <h1 className="text-xl font-bold text-foreground mb-2">
          Confirm sign-in
        </h1>
        <p className="text-sm text-foreground-muted mb-1">
          You&apos;re signing in as
        </p>
        <p className="text-sm font-medium text-foreground break-all mb-6">
          {email}
        </p>

        <a
          href={consumeUrl}
          className="block w-full bg-accent text-white py-2.5 px-4 rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors"
        >
          Continue to Contractor App
        </a>

        <p className="mt-4 text-xs text-foreground-soft">
          One click — links work once and expire after 24 hours.
        </p>
      </div>
    </div>
  )
}
