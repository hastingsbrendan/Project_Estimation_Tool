import NextAuth from "next-auth"
import { PrismaAdapter } from "@auth/prisma-adapter"
import Nodemailer from "next-auth/providers/nodemailer"
import { prisma } from "@/lib/db"

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    Nodemailer({
      server: { host: "localhost", port: 25 }, // unused in dev; overridden below
      from: process.env.EMAIL_FROM ?? "noreply@contractor-app.local",
      async sendVerificationRequest({ identifier, url }) {
        if (process.env.NODE_ENV !== "production") {
          console.log("\n========================================")
          console.log("  Magic link for:", identifier)
          console.log("  URL:", url)
          console.log("========================================\n")
          return
        }
        // TODO: wire Resend for production email
        throw new Error("Production email provider not configured. Set up Resend and update this function.")
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
})
