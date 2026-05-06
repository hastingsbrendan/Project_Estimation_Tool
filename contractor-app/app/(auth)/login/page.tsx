"use client"

import { signIn } from "next-auth/react"
import { useSearchParams } from "next/navigation"
import { useState, Suspense } from "react"

function LoginForm() {
  const params = useSearchParams()
  const [email, setEmail] = useState("")
  const [pending, setPending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState("")

  const checkEmail = params.get("check-email")
  const hasError = params.get("error")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email) return
    setPending(true)
    setError("")
    try {
      const result = await signIn("nodemailer", {
        email,
        redirect: false,
        callbackUrl: params.get("callbackUrl") ?? "/projects",
      })
      if (result?.error) {
        setError("Something went wrong. Please try again.")
      } else {
        setSent(true)
      }
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setPending(false)
    }
  }

  if (sent || checkEmail) {
    return (
      <div className="text-center">
        <div className="mb-4 text-4xl">📬</div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Check your inbox</h2>
        <p className="text-gray-600">
          We sent a magic link to <strong>{email || "your email"}</strong>. Click it to sign in.
        </p>
        <p className="mt-4 text-sm text-gray-400">
          Didn&apos;t get it? Check spam or{" "}
          <button
            onClick={() => { setSent(false) }}
            className="text-blue-600 hover:underline"
          >
            try again
          </button>
          .
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-12 h-12 bg-gray-900 rounded-xl mb-4">
          <span className="text-white text-lg">🔨</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Contractor App</h1>
        <p className="text-gray-500 mt-1 text-sm">Sign in to manage your estimates</p>
      </div>

      {(hasError || error) && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error || "Sign-in failed. Please try again."}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
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
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="w-full bg-gray-900 text-white py-2.5 px-4 rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {pending ? "Sending…" : "Send magic link"}
        </button>
      </form>

      <p className="mt-6 text-center text-xs text-gray-400">
        No password needed. We&apos;ll email you a sign-in link.
      </p>
    </>
  )
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  )
}
