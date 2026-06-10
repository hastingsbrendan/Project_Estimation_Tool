import { prisma } from "@/lib/db"

/**
 * Per-user business identity for client-facing surfaces.
 *
 * Resolution order, field by field:
 *   1. The user's BusinessProfile row (set on /settings)
 *   2. CONTRACTOR_* env vars (the original single-user dogfood config —
 *      kept so the existing deployment keeps its branding until the
 *      profile is filled in)
 *   3. Hard default for businessName only; everything else just
 *      doesn't render when missing.
 */

export type ResolvedBranding = {
  businessName: string
  tagline: string | null
  licenseNumber: string | null
  phone: string | null
  email: string | null
  address: string | null
  logoUrl: string | null
}

export async function getBrandingForUser(
  userId: string,
): Promise<ResolvedBranding> {
  const profile = await prisma.businessProfile.findUnique({
    where: { userId },
  })
  return {
    businessName:
      profile?.businessName?.trim() ||
      process.env.CONTRACTOR_BUSINESS_NAME ||
      "Reliable Remodeling",
    tagline: profile?.tagline?.trim() || null,
    licenseNumber:
      profile?.licenseNumber?.trim() || process.env.CONTRACTOR_LICENSE || null,
    phone: profile?.phone?.trim() || process.env.CONTRACTOR_PHONE || null,
    email: profile?.email?.trim() || process.env.CONTRACTOR_EMAIL || null,
    address: profile?.address?.trim() || process.env.CONTRACTOR_ADDRESS || null,
    logoUrl: profile?.logoUrl || null,
  }
}
