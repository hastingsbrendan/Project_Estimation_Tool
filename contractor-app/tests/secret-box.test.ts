import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { randomBytes } from "node:crypto"
import { encrypt, decrypt, isPiiKeyConfigured, last4 } from "../lib/crypto/secret-box"

describe("crypto/secret-box", () => {
  const originalKey = process.env.SUBCONTRACTOR_PII_KEY

  beforeEach(() => {
    process.env.SUBCONTRACTOR_PII_KEY = randomBytes(32).toString("base64")
  })

  afterEach(() => {
    if (originalKey === undefined) delete process.env.SUBCONTRACTOR_PII_KEY
    else process.env.SUBCONTRACTOR_PII_KEY = originalKey
  })

  it("isPiiKeyConfigured reports true when key is set", () => {
    expect(isPiiKeyConfigured()).toBe(true)
  })

  it("isPiiKeyConfigured reports false when key is missing", () => {
    delete process.env.SUBCONTRACTOR_PII_KEY
    expect(isPiiKeyConfigured()).toBe(false)
  })

  it("isPiiKeyConfigured reports false when key is wrong length", () => {
    process.env.SUBCONTRACTOR_PII_KEY = randomBytes(16).toString("base64")
    expect(isPiiKeyConfigured()).toBe(false)
  })

  it("encrypt → decrypt round-trips a plain string", () => {
    const cipher = encrypt("123456789")
    expect(decrypt(cipher)).toBe("123456789")
  })

  it("encrypt produces a different ciphertext for the same plaintext (random nonce)", () => {
    const a = encrypt("123456789")
    const b = encrypt("123456789")
    expect(a).not.toBe(b)
  })

  it("encrypt format is colon-separated three-part base64", () => {
    const cipher = encrypt("123456789")
    const parts = cipher.split(":")
    expect(parts).toHaveLength(3)
    parts.forEach((p) => expect(p).toMatch(/^[A-Za-z0-9+/=]+$/))
  })

  it("decrypt returns null for tampered ciphertext", () => {
    const cipher = encrypt("123456789")
    const parts = cipher.split(":")
    // Flip a single bit in the body.
    const tampered = Buffer.from(parts[1], "base64")
    tampered[0] ^= 0x01
    const bad = `${parts[0]}:${tampered.toString("base64")}:${parts[2]}`
    expect(decrypt(bad)).toBeNull()
  })

  it("decrypt returns null for malformed input", () => {
    expect(decrypt("not:enough")).toBeNull()
    expect(decrypt("definitely-not-base64-stuff")).toBeNull()
    expect(decrypt("")).toBeNull()
  })

  it("decrypt returns null when key is missing", () => {
    const cipher = encrypt("123456789")
    delete process.env.SUBCONTRACTOR_PII_KEY
    expect(decrypt(cipher)).toBeNull()
  })

  it("decrypt returns null when key is rotated to a different value", () => {
    const cipher = encrypt("123456789")
    process.env.SUBCONTRACTOR_PII_KEY = randomBytes(32).toString("base64")
    expect(decrypt(cipher)).toBeNull()
  })

  it("encrypt throws (does not silently fail) when key is missing", () => {
    delete process.env.SUBCONTRACTOR_PII_KEY
    expect(() => encrypt("123456789")).toThrow(/SUBCONTRACTOR_PII_KEY/)
  })
})

describe("crypto/secret-box last4", () => {
  it("returns last 4 digits of a 9-digit ID", () => {
    expect(last4("123456789")).toBe("6789")
  })

  it("strips formatting characters", () => {
    expect(last4("123-45-6789")).toBe("6789")
    expect(last4("12-3456789")).toBe("6789")
  })

  it("pads with leading zeros for short input", () => {
    expect(last4("12")).toBe("0012")
  })

  it("returns last 4 of longer-than-9-digit input", () => {
    expect(last4("12345678901234")).toBe("1234")
  })
})
