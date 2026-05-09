/**
 * Helpers for the magic-link interstitial flow.
 *
 * See `app/(auth)/login/confirm/page.tsx` and `auth.ts`
 * `sendVerificationRequest` for the why.
 */

/**
 * Rewrite an Auth.js-provided callback URL like
 *   https://<host>/api/auth/callback/nodemailer?token=…&email=…&callbackUrl=…
 * to point at our `/login/confirm` interstitial, preserving the same
 * query params. The interstitial server-renders a confirmation
 * button; only the user's click on that button hits the real callback
 * and consumes the verification token.
 *
 * If the URL doesn't look like an Auth.js callback (someone passes
 * a custom URL to sendVerificationRequest), return it unchanged so
 * we don't accidentally break a non-magic-link flow.
 */
export function wrapInInterstitial(rawUrl: string): string {
  try {
    const u = new URL(rawUrl)
    if (!u.pathname.startsWith("/api/auth/callback/")) return rawUrl
    const wrapped = new URL("/login/confirm", u.origin)
    u.searchParams.forEach((value, key) => wrapped.searchParams.set(key, value))
    return wrapped.toString()
  } catch {
    return rawUrl
  }
}
