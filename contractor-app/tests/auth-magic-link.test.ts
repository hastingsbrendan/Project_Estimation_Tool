import { describe, it, expect } from "vitest"
import { wrapInInterstitial } from "../lib/auth-magic-link"

describe("wrapInInterstitial", () => {
  it("rewrites an Auth.js callback URL to /login/confirm", () => {
    const raw =
      "https://app.example.com/api/auth/callback/nodemailer?token=abc123&email=ricky%40example.com&callbackUrl=%2Fprojects"
    const out = wrapInInterstitial(raw)
    const u = new URL(out)
    expect(u.origin).toBe("https://app.example.com")
    expect(u.pathname).toBe("/login/confirm")
    expect(u.searchParams.get("token")).toBe("abc123")
    expect(u.searchParams.get("email")).toBe("ricky@example.com")
    expect(u.searchParams.get("callbackUrl")).toBe("/projects")
  })

  it("preserves all query params on the new URL", () => {
    const raw =
      "https://app.example.com/api/auth/callback/nodemailer?token=t&email=e&callbackUrl=cb&extra=foo&another=bar"
    const out = wrapInInterstitial(raw)
    const u = new URL(out)
    expect(u.searchParams.get("extra")).toBe("foo")
    expect(u.searchParams.get("another")).toBe("bar")
  })

  it("works for any provider, not just nodemailer", () => {
    const raw =
      "https://app.example.com/api/auth/callback/email?token=x&email=y"
    const out = wrapInInterstitial(raw)
    expect(new URL(out).pathname).toBe("/login/confirm")
  })

  it("leaves non-callback URLs unchanged", () => {
    const raw = "https://app.example.com/projects"
    expect(wrapInInterstitial(raw)).toBe(raw)
  })

  it("leaves Auth.js URLs that aren't callbacks unchanged", () => {
    const raw = "https://app.example.com/api/auth/signin/nodemailer"
    expect(wrapInInterstitial(raw)).toBe(raw)
  })

  it("returns the input unchanged for malformed URLs", () => {
    expect(wrapInInterstitial("not a url")).toBe("not a url")
    expect(wrapInInterstitial("")).toBe("")
  })

  it("does not double-wrap an already-wrapped URL", () => {
    const wrapped =
      "https://app.example.com/login/confirm?token=t&email=e&callbackUrl=cb"
    expect(wrapInInterstitial(wrapped)).toBe(wrapped)
  })
})
