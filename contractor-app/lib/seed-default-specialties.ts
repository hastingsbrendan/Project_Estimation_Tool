import { prisma } from "./db"
import { SPECIALTY_SEED } from "@/seeds/specialties"
import { logError, logInfo } from "./log"

/**
 * Ensure the 12 default specialties exist. Idempotent — only inserts the
 * slugs that aren't already in the table (Specialty.slug is UNIQUE). Safe
 * to call from Auth.js events.createUser (per-user invocation) or from a
 * lazy "first /subs visit" check.
 *
 * Default specialties are global (userId=null, isDefault=true), so
 * inserting them is a one-time platform-level operation. We still call it
 * per-user-create as a no-op safety net in case the platform install
 * forgot to seed — cheap and self-healing.
 */
export async function ensureDefaultSpecialties(): Promise<{ inserted: number }> {
  try {
    const existing = await prisma.specialty.findMany({
      where: { slug: { in: SPECIALTY_SEED.map((s) => s.slug) } },
      select: { slug: true },
    })
    const have = new Set(existing.map((s) => s.slug))
    const toInsert = SPECIALTY_SEED.filter((s) => !have.has(s.slug))

    if (toInsert.length === 0) return { inserted: 0 }

    await prisma.specialty.createMany({
      data: toInsert.map((s) => ({
        slug: s.slug,
        label: s.label,
        isDefault: true,
        userId: null,
      })),
    })

    logInfo("ensureDefaultSpecialties", "Seeded default specialties", {
      inserted: toInsert.length,
    })
    return { inserted: toInsert.length }
  } catch (e) {
    logError("ensureDefaultSpecialties", e)
    return { inserted: 0 }
  }
}
