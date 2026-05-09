import { prisma } from "./db"
import { CATALOG_SEED } from "@/seeds/catalog"
import { logError, logInfo } from "./log"

/**
 * Seed the default catalog (~300 starter items across 6 trades) for a user.
 *
 * Used in two places:
 *  1. Auth.js `events.createUser` hook — fires once per new account so a
 *     contractor signing in for the first time has a catalog to draw from
 *     immediately. Without this, the "Add line item" picker shows an empty
 *     dropdown which is the single biggest first-impression friction.
 *  2. The "Update dummy catalog" banner on the project page — the same
 *     seed, available manually for existing users (or anyone who wiped
 *     their catalog).
 *
 * Idempotent: skips items the user already has at exact (description, trade)
 * match, so re-running is safe and additive. Returns the count inserted so
 * callers can toast.
 */
export async function seedDefaultCatalogForUser(
  userId: string,
): Promise<{ inserted: number }> {
  try {
    const existing = await prisma.catalogItem.findMany({
      where: { userId },
      select: { description: true, trade: true },
    })
    const have = new Set(existing.map((i) => `${i.trade}::${i.description}`))

    const toInsert = CATALOG_SEED.filter(
      (s) => !have.has(`${s.trade}::${s.description}`),
    )

    if (toInsert.length === 0) {
      return { inserted: 0 }
    }

    await prisma.catalogItem.createMany({
      data: toInsert.map((s) => ({
        userId,
        trade: s.trade,
        description: s.description,
        unit: s.unit,
        unitPrice: s.unitPrice,
        kind: s.kind,
      })),
    })

    logInfo("seedDefaultCatalogForUser", "Seeded starter catalog", {
      userId,
      inserted: toInsert.length,
    })
    return { inserted: toInsert.length }
  } catch (e) {
    // Don't let a seed failure block sign-in. Log it so we can investigate
    // — the user can hit "Update dummy catalog" later from the banner.
    logError("seedDefaultCatalogForUser", e, { userId })
    return { inserted: 0 }
  }
}
