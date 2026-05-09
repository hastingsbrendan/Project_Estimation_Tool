/**
 * Seed 10 realistic Home Depot products into a user's catalog so the
 * cart-builder extension has ground truth to match against.
 *
 * Each entry is a real, common HD product written the way a contractor
 * would type it — concise, no marketing fluff, with a unit + price that's
 * close enough to current HD pricing (April 2026 ballpark) that the
 * delta-detection in the catalog-receipt review will look meaningful when
 * a real receipt updates them.
 *
 * Usage:
 *   # against your local dev DB (default):
 *   npx tsx scripts/seed-hd-test-products.ts you@example.com
 *
 *   # against prod (Turso) — set DATABASE_URL + DATABASE_AUTH_TOKEN first:
 *   DATABASE_URL=libsql://... DATABASE_AUTH_TOKEN=... \
 *     npx tsx scripts/seed-hd-test-products.ts you@example.com
 *
 * Idempotent: skips items already in the user's catalog (matched on
 * lowercased description + trade). Re-run anytime.
 *
 * The descriptions are chosen so a HD search for the exact text returns
 * a reasonable top-5 set of candidates — i.e. they're matchable, not
 * uniquely-SKU'd. That's deliberate: the cart-builder's job is to PICK
 * among reasonable candidates, not to know the exact SKU up front.
 */
import { PrismaLibSql } from "@prisma/adapter-libsql"
import { PrismaClient } from "../app/generated/prisma/client"
import type { TradeSlug } from "../lib/catalog/trades"

type SeedItem = {
  trade: TradeSlug
  description: string
  unit: string
  unitPrice: number
  kind: "material" | "labor"
  /**
   * Optional Home Depot SKU. When present, the cart-builder navigates
   * straight to the PDP for this SKU instead of fuzzy-searching by
   * description. Leave empty when you don't have a known SKU on hand —
   * the user can paste it in via the catalog UI later.
   */
  hdSku?: string
  notes?: string
}

const HD_TEST_PRODUCTS: SeedItem[] = [
  {
    trade: "framing",
    description: "2x4 stud, 8ft, SPF",
    unit: "ea",
    unitPrice: 4.29,
    kind: "material",
    notes:
      "HD: 'Premium SPF stud 2x4-8ft'. Common framing stud, every store carries it.",
  },
  {
    trade: "framing",
    description: "1x4 pine, 8ft, S4S",
    unit: "ea",
    unitPrice: 7.85,
    kind: "material",
    notes: "HD: 'Common Board' aisle. Pine, surfaced four sides.",
  },
  {
    trade: "drywall",
    description: "Drywall sheet 4x8 1/2 inch",
    unit: "sheet",
    unitPrice: 13.99,
    kind: "material",
    notes:
      "USG Sheetrock UltraLight or equivalent. Standard interior drywall.",
  },
  {
    trade: "drywall",
    description: "Drywall screws 1-5/8 inch coarse, 5 lb tub",
    unit: "tub",
    unitPrice: 24.5,
    kind: "material",
    notes: "Grip-Rite or equivalent. Coarse thread for wood studs.",
  },
  {
    trade: "drywall",
    description: "Joint compound, all-purpose, 5 gal bucket",
    unit: "bucket",
    unitPrice: 18.75,
    kind: "material",
    notes: "USG All Purpose or Easy Sand 90 mud — common across stores.",
  },
  {
    trade: "plumbing",
    description: "PEX-A pipe, 1/2 in, 10 ft stick",
    unit: "ea",
    unitPrice: 9.85,
    kind: "material",
    notes: "Apollo or Uponor. Stocked in 10ft sticks AND 100ft coils.",
  },
  {
    trade: "plumbing",
    description: "PVC primer + cement, 4 oz, clear/blue",
    unit: "kit",
    unitPrice: 8.5,
    kind: "material",
    notes: "Oatey All-Purpose 30-second cement + primer kit.",
  },
  {
    trade: "electrical",
    description: "12-2 NM-B Romex wire, 50 ft coil",
    unit: "coil",
    unitPrice: 78.0,
    kind: "material",
    notes: "Southwire 12-2 with ground. 250 ft coils also common.",
  },
  {
    trade: "painting",
    description: "Caulk, white, paintable, 10 oz tube",
    unit: "ea",
    unitPrice: 4.85,
    kind: "material",
    notes: "DAP Alex Plus or equivalent acrylic latex.",
  },
  {
    trade: "painting",
    description: "Latex paint, eggshell, 1 gallon, white",
    unit: "gal",
    unitPrice: 41.0,
    kind: "material",
    notes:
      "Behr Premium Plus or Marquee in eggshell white. Real prices vary by tint.",
  },
]

async function main() {
  const email = process.argv[2]?.trim()
  if (!email) {
    console.error(
      "Usage: tsx scripts/seed-hd-test-products.ts <user-email>\n" +
        "  Seeds 10 known Home Depot products into the named user's catalog.",
    )
    process.exit(2)
  }

  const url = process.env.DATABASE_URL
  if (!url) {
    console.error("DATABASE_URL is not set")
    process.exit(2)
  }
  const adapter = new PrismaLibSql({
    url,
    authToken: process.env.DATABASE_AUTH_TOKEN,
  })
  const prisma = new PrismaClient({ adapter })

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) {
    console.error(`No user with email "${email}" — sign in once before seeding.`)
    process.exit(1)
  }

  const existing = await prisma.catalogItem.findMany({
    where: { userId: user.id },
    select: { description: true, trade: true },
  })
  const have = new Set(
    existing.map((i) => `${i.trade}::${i.description.toLowerCase()}`),
  )

  const toInsert = HD_TEST_PRODUCTS.filter(
    (p) => !have.has(`${p.trade}::${p.description.toLowerCase()}`),
  )

  if (toInsert.length === 0) {
    console.log(`No new items to seed for ${email}. (All ${HD_TEST_PRODUCTS.length} already exist.)`)
    await prisma.$disconnect()
    return
  }

  await prisma.catalogItem.createMany({
    data: toInsert.map((p) => ({
      userId: user.id,
      trade: p.trade,
      description: p.description,
      unit: p.unit,
      unitPrice: p.unitPrice,
      kind: p.kind,
      hdSku: p.hdSku ?? null,
      notes: p.notes ?? null,
    })),
  })

  console.log(
    `Seeded ${toInsert.length} HD test products for ${email}.\n` +
      toInsert.map((p) => `  • ${p.description} (${p.unit}, $${p.unitPrice.toFixed(2)})`).join("\n"),
  )
  await prisma.$disconnect()
}

main().catch((err) => {
  console.error("Seed failed:", err)
  process.exit(1)
})
