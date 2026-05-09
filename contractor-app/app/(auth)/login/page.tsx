"use client"

import { signIn } from "next-auth/react"
import { useSearchParams } from "next/navigation"
import { useEffect, useRef, useState, Suspense } from "react"

const RESEND_COOLDOWN_SECONDS = 30

function LoginForm() {
  const params = useSearchParams()
  const [email, setEmail] = useState("")
  const [pending, setPending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState("")
  const [cooldown, setCooldown] = useState(0)
  const cooldownTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  const checkEmail = params.get("check-email")
  const hasError = params.get("error")

  // Tick down the resend cooldown once per second.
  useEffect(() => {
    if (cooldown <= 0) {
      if (cooldownTimer.current) clearInterval(cooldownTimer.current)
      cooldownTimer.current = null
      return
    }
    cooldownTimer.current = setInterval(() => {
      setCooldown((c) => Math.max(0, c - 1))
    }, 1000)
    return () => {
      if (cooldownTimer.current) clearInterval(cooldownTimer.current)
    }
  }, [cooldown])

  async function send(targetEmail: string) {
    if (!targetEmail) return
    setPending(true)
    setError("")
    try {
      const result = await signIn("nodemailer", {
        email: targetEmail,
        redirect: false,
        callbackUrl: params.get("callbackUrl") ?? "/projects",
      })
      if (result?.error) {
        setError("Something went wrong. Please try again.")
      } else {
        setSent(true)
        setCooldown(RESEND_COOLDOWN_SECONDS)
      }
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setPending(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await send(email)
  }

  if (sent || checkEmail) {
    const showEmail = email || "your email"
    return (
      <div className="text-center">
        <div className="mb-4 text-4xl">📬</div>
        <h2 className="text-xl font-semibold text-foreground mb-2">Check your inbox</h2>
        <p className="text-foreground-muted">
          We sent a magic link to <strong className="break-all">{showEmail}</strong>.
          Click the button in the email to sign in.
        </p>
        <p className="mt-3 text-sm text-foreground-soft">
          The link works once and expires in 24 hours.{" "}
          <strong>Check your spam folder</strong> if you don&apos;t see it within a
          minute.
        </p>

        <div className="mt-6 flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={() => email && send(email)}
            disabled={pending || cooldown > 0 || !email}
            className="text-sm text-accent hover:underline disabled:opacity-50 disabled:no-underline disabled:cursor-not-allowed"
          >
            {pending
              ? "Resending…"
              : cooldown > 0
                ? `Resend in ${cooldown}s`
                : "Resend the link"}
          </button>
          <button
            type="button"
            onClick={() => {
              setSent(false)
              setError("")
              setCooldown(0)
            }}
            className="text-xs text-foreground-soft hover:text-foreground hover:underline"
          >
            Wrong email? Try a different address →
          </button>
        </div>

        {error && (
          <p className="mt-4 text-xs text-danger" aria-live="polite">
            {error}
          </p>
        )}
      </div>
    )
  }

  return (
    <>
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-12 h-12 bg-accent rounded-xl mb-4 shadow-sm">
          <span className="text-white text-lg">🔨</span>
        </div>
        <h1 className="text-2xl font-bold text-foreground">Contractor App</h1>
        <p className="text-foreground-soft mt-1 text-sm">Sign in to manage your estimates</p>
      </div>

      {(hasError || error) && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-danger">
          {error || "Sign-in failed. Please try again."}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-foreground mb-1">
            Email address
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            autoComplete="email"
            className="w-full px-3 py-2.5 border border-border rounded-lg text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="w-full bg-accent text-white py-2.5 px-4 rounded-lg text-sm font-medium hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {pending ? "Sending…" : "Send magic link"}
        </button>
      </form>

      <p className="mt-6 text-center text-xs text-foreground-soft">
        No password needed. We&apos;ll email you a sign-in link.
      </p>
    </>
  )
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-surface rounded-2xl shadow-sm border border-border p-8">
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  )
}
