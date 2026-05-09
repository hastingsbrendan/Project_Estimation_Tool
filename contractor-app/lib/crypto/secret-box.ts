/**
 * Authenticated symmetric encryption for at-rest PII (subcontractor SSN /
 * EIN). Uses AES-256-GCM via Node's built-in `crypto`. Output is a single
 * string `<base64nonce>:<base64cipher>:<base64authtag>` so it round-trips
 * through a TEXT column without separate fields.
 *
 * Key: SUBCONTRACTOR_PII_KEY env var, 32 raw bytes encoded as base64.
 * Generate one with:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 *
 * If the key is missing, encrypt() throws with a clear "configure
 * SUBCONTRACTOR_PII_KEY" message and decrypt() returns null. Callers
 * should guard the UI on `isPiiKeyConfigured()` before exposing the
 * tax-id field for editing, and degrade the 1099 page gracefully.
 *
 * Format choice: not envelope encryption — there's no per-row key. We're
 * protecting against DB-only compromise (Turso snapshot leaking, accidental
 * log dump including a row), not against an attacker who has the running
 * server. For a contractor-app threat model that's the right line.
 */
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  type CipherGCM,
  type DecipherGCM,
} from "node:crypto"

const ALGO = "aes-256-gcm"
const KEY_BYTES = 32
const NONCE_BYTES = 12 // GCM standard

function loadKey(): Buffer | null {
  const raw = process.env.SUBCONTRACTOR_PII_KEY
  if (!raw) return null
  let buf: Buffer
  try {
    buf = Buffer.from(raw, "base64")
  } catch {
    return null
  }
  if (buf.length !== KEY_BYTES) return null
  return buf
}

export function isPiiKeyConfigured(): boolean {
  return loadKey() !== null
}

export function encrypt(plaintext: string): string {
  const key = loadKey()
  if (!key) {
    throw new Error(
      "SUBCONTRACTOR_PII_KEY is not configured. Generate a 32-byte base64 key and set it in env.",
    )
  }
  const nonce = randomBytes(NONCE_BYTES)
  const cipher = createCipheriv(ALGO, key, nonce) as CipherGCM
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()
  return [
    nonce.toString("base64"),
    encrypted.toString("base64"),
    authTag.toString("base64"),
  ].join(":")
}

/**
 * Returns the decrypted string, or null if:
 *  - the key isn't configured (caller should treat as "tax id locked")
 *  - the ciphertext is malformed
 *  - the auth tag doesn't verify (tamper or wrong key)
 *
 * Never throws — caller branches on null.
 */
export function decrypt(ciphertext: string): string | null {
  const key = loadKey()
  if (!key) return null
  const parts = ciphertext.split(":")
  if (parts.length !== 3) return null
  try {
    const nonce = Buffer.from(parts[0], "base64")
    const encrypted = Buffer.from(parts[1], "base64")
    const authTag = Buffer.from(parts[2], "base64")
    if (nonce.length !== NONCE_BYTES) return null
    const decipher = createDecipheriv(ALGO, key, nonce) as DecipherGCM
    decipher.setAuthTag(authTag)
    const out = Buffer.concat([decipher.update(encrypted), decipher.final()])
    return out.toString("utf8")
  } catch {
    return null
  }
}

/**
 * Convenience: extract the trailing 4 digits of a tax ID (SSN or EIN) so
 * we can store them plaintext for masked display ("•••• 1234") without
 * decrypting on every page render. Strips non-digits first.
 */
export function last4(taxId: string): string {
  const digits = taxId.replace(/\D/g, "")
  return digits.slice(-4).padStart(4, "0")
}
