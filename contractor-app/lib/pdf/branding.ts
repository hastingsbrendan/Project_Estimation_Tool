/**
 * Branding constants + logo loading for server-rendered PDFs.
 *
 * Reads the first available logo file from `public/branding/` (jpg, jpeg, or
 * png) once at module load. Falls back to text-only branding if nothing is
 * present so the PDF still renders.
 */
import { readFileSync } from "node:fs"
import path from "node:path"

export const BRAND = {
  name: "Reliable Remodeling",
  shortName: "Reliable Remodeling",
  tagline: "",
  // Black accent matches the logo.
  accentHex: "#18181b",
  mutedHex: "#52525b",
  softHex: "#71717a",
  borderHex: "#d6d3ce",
  surfaceMutedHex: "#f5f3ef",
} as const

function loadLogo(): { data: Buffer; format: "png" | "jpg" } | null {
  const candidates: Array<{ file: string; format: "png" | "jpg" }> = [
    { file: "logo.jpg", format: "jpg" },
    { file: "logo.jpeg", format: "jpg" },
    { file: "logo.png", format: "png" },
  ]
  for (const { file, format } of candidates) {
    try {
      const data = readFileSync(path.join(process.cwd(), "public", "branding", file))
      // Some files have wrong extensions — sniff the first bytes to detect.
      const sniffedFormat = sniff(data) ?? format
      return { data, format: sniffedFormat }
    } catch {
      // try next
    }
  }
  return null
}

function sniff(buf: Buffer): "png" | "jpg" | null {
  if (buf.length < 4) return null
  // PNG: 89 50 4E 47
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "png"
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg"
  return null
}

const _logo = loadLogo()

/**
 * Logo data for @react-pdf/renderer. Pass to `<Image src={LOGO} />`.
 * Null when no logo file is present in public/branding/.
 *
 * @react-pdf accepts a Buffer directly (auto-detects format).
 */
export const LOGO: Buffer | null = _logo?.data ?? null
