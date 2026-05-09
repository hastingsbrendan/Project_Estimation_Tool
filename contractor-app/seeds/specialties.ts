/**
 * Default subcontractor specialty taxonomy. 12 trades chosen to cover
 * residential remodel + light commercial. Seeded as `isDefault=true,
 * userId=null` rows that are visible to every user. Custom user-specific
 * specialties can be added separately and live with `userId` set.
 *
 * The 6 trades that overlap with the catalog (`demo`, `framing`, ...)
 * use the same slugs so a future "trade ↔ specialty" join becomes trivial.
 */

export type SpecialtySeed = {
  slug: string
  label: string
}

export const SPECIALTY_SEED: readonly SpecialtySeed[] = [
  { slug: "demo", label: "Demo" },
  { slug: "framing", label: "Framing" },
  { slug: "plumbing", label: "Plumbing" },
  { slug: "electrical", label: "Electrical" },
  { slug: "drywall", label: "Drywall" },
  { slug: "finish", label: "Finish carpentry" },
  { slug: "roofing", label: "Roofing" },
  { slug: "hvac", label: "HVAC" },
  { slug: "concrete", label: "Concrete" },
  { slug: "painting", label: "Painting" },
  { slug: "tile", label: "Tile" },
  { slug: "landscape", label: "Landscape" },
] as const
