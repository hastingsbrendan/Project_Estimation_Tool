import NextAuth from "next-auth"
import { PrismaAdapter } from "@auth/prisma-adapter"
import Nodemailer from "next-auth/providers/nodemailer"
import { prisma } from "@/lib/db"
import { seedDefaultCatalogForUser } from "@/lib/seed-default-catalog"
import { ensureDefaultSpecialties } from "@/lib/seed-default-specialties"
import { wrapInInterstitial } from "@/lib/auth-magic-link"

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    Nodemailer({
      server: { host: "localhost", port: 25 }, // unused in dev; overridden below
      from: process.env.EMAIL_FROM ?? "noreply@contractor-app.local",
      async sendVerificationRequest({ identifier, url }) {
        // Wrap the Auth.js-provided callback URL in our /login/confirm
        // interstitial. Email link scanners (Gmail Safe Browsing,
        // Outlook Safe Links, Proofpoint, etc.) GET URLs in incoming
        // mail to scan for malware — that GET would otherwise burn
        // the single-use verification token before the user clicks.
        // The interstitial does not consume the token; the user's
        // click on its "Continue" button is what hits the real callback.
        const linkUrl = wrapInInterstitial(url)

        if (process.env.NODE_ENV !== "production") {
          console.log("\n========================================")
          console.log("  Magic link for:", identifier)
          console.log("  URL (interstitial):", linkUrl)
          console.log("  URL (raw callback):", url)
          console.log("========================================\n")
          return
        }

        const apiKey = process.env.RESEND_API_KEY
        if (!apiKey) throw new Error("RESEND_API_KEY is not set")

        const from = process.env.EMAIL_FROM ?? "onboarding@resend.dev"
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from,
            to: [identifier],
            subject: "Sign in to Contractor App",
            html: `<!DOCTYPE html><html><body style="font-family: system-ui, -apple-system, sans-serif; padding: 32px; background: #f6f6f6;"><div style="max-width: 480px; margin: 0 auto; background: white; padding: 32px; border-radius: 8px;"><h1 style="margin: 0 0 16px; font-size: 20px; color: #111;">Sign in to Contractor App</h1><p style="color: #444; line-height: 1.5;">Click the button below to sign in. This link expires in 24 hours.</p><p style="margin: 24px 0;"><a href="${linkUrl}" style="display: inline-block; background: #1a1a1a; color: white; padding: 12px 20px; border-radius: 6px; text-decoration: none; font-weight: 500;">Sign in</a></p><p style="color: #888; font-size: 13px;">If the button doesn't work, paste this URL into your browser:<br><span style="word-break: break-all;">${linkUrl}</span></p></div></body></html>`,
            text: `Sign in to Contractor App\n\nClick this link to sign in (expires in 24 hours):\n${linkUrl}`,
          }),
        })

        if (!res.ok) {
          const body = await res.text()
          throw new Error(`Resend send failed (${res.status}): ${body}`)
        }
      },
    }),
  ],
  pages: {
    signIn: "/login",
    verifyRequest: "/login?check-email=1",
    error: "/login?error=1",
  },
  session: {
    strategy: "database",
  },
  events: {
    /**
     * Fired once per new account creation. Seed the starter catalog so
     * the contractor's first project picker isn't empty — single biggest
     * first-impression friction otherwise. Errors inside the seed are
     * logged but never bubble — sign-in must succeed even if seeding fails.
     */
    createUser: async ({ user }) => {
      if (user.id) {
        // Catalog is per-user; specialties are global with isDefault=true.
        // ensureDefaultSpecialties is idempotent — it's safe to call on
        // every signup, and on the first signup it self-heals if the
        // global seed didn't run at deploy time.
        await Promise.all([
          seedDefaultCatalogForUser(user.id),
          ensureDefaultSpecialties(),
        ])
      }
    },
  },
})
