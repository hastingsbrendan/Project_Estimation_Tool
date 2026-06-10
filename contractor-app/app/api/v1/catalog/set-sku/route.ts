import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { logError, logInfo } from "@/lib/log"
import { checkExtensionVersion } from "@/lib/api-v1/extension-version"

export const runtime = "nodejs"

const SCOPE = "/api/v1/catalog/set-sku"

/**
 * POST { catalogItemId: string, sku: string }
 *
 * The "match once, remember forever" learning loop: when the cart-builder
 * couldn't auto-match a material and the contractor taps the right
 * product in the side panel's review list, the extension calls this to
 * persist the confirmed SKU on the catalog item. Every manual resolution
 * permanently fixes that item — the next cart run navigates straight to
 * the PDP.
 *
 * Unlike the receipt flow (which never overwrites a different existing
 * SKU), this WRITE IS authoritative: the user just looked at the actual
 * product page candidates and picked one. Explicit human confirmation
 * beats whatever was stored.
 */
export async function POST(req: Request) {
  const started = Date.now()
  const versionBlock = checkExtensionVersion(req)
  if (versionBlock) return versionBlock

  const session = await auth()
  if (!session?.user?.email) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  })
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 })
  }
  const b = (body ?? {}) as Record<string, unknown>
  const catalogItemId =
    typeof b.catalogItemId === "string" ? b.catalogItemId.trim() : ""
  const sku = typeof b.sku === "string" ? b.sku.trim() : ""
  if (!catalogItemId) {
    return Response.json({ error: "catalogItemId required" }, { status: 400 })
  }
  if (!sku) {
    return Response.json({ error: "sku required" }, { status: 400 })
  }

  try {
    // Scoped on userId so a tampered id can't write to another user's
    // catalog — same pattern as applyCatalogUpdates.
    const result = await prisma.catalogItem.updateMany({
      where: { id: catalogItemId, userId: user.id, archived: false },
      data: { hdSku: sku },
    })
    if (result.count === 0) {
      return Response.json({ error: "Catalog item not found" }, { status: 404 })
    }
    logInfo(SCOPE, "SKU confirmed from cart-builder review", {
      userId: user.id,
      catalogItemId,
      sku,
      durationMs: Date.now() - started,
    })
    return Response.json({ ok: true })
  } catch (e) {
    logError(SCOPE, e, { catalogItemId, durationMs: Date.now() - started })
    return Response.json({ error: "Internal error" }, { status: 500 })
  }
}
