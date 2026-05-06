/**
 * Branding constants + logo loading for server-rendered PDFs.
 *
 * The logo file lives at `public/branding/logo.png`. We read it once at
 * module load (not per render) and gracefully fall back to a text-only
 * brand if the file is missing — so the build never breaks if a designer
 * is mid-swap.
 */
import { readFileSync } from "node:fs"
import path from "node:path"

export const BRAND = {
  name: "Reliable Remodeling",
  shortName: "Reliable Remodeling",
  tagline: "", // optional secondary line under the brand name
  // Used as the accent color across PDFs. Black per the new logo.
  accentHex: "#18181b",
  // Used for muted text / borders.
  mutedHex: "#52525b",
  softHex: "#71717a",
  borderHex: "#d6d3ce",
  surfaceMutedHex: "#f5f3ef",
} as const

export const LOGO: Buffer | null = (() => {
  try {
    return readFileSync(path.join(process.cwd(), "public", "branding", "logo.png"))
  } catch {
    return null
  }
})()
