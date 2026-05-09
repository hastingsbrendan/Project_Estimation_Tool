# Backlog

Out-of-scope items captured during W1–W4 implementation that are worth picking up later.

## Cart-builder: multi-retailer expansion

**Today:** the Chrome extension drives only Home Depot. The catalog stores
SKUs in a `CatalogItem.hdSku` field hardcoded around HD's PDP URL shape
(`/p/<slug>/<sku>`) and search behavior (SKU search redirects to PDP).

**What we want next:** cart-build at Lowe's, Menards, Floor & Decor, and
similar big-box / specialty retailers.

### Schema changes (when we go to do this)

Replace the single `hdSku` column with a multi-retailer mapping. Two
viable shapes:

1. **Per-retailer columns**: `hdSku`, `lowesSku`, `menardsSku`,
   `fdSku` etc. on `CatalogItem`. Cheap, ergonomic for the UI, but
   adding a retailer requires a migration.
2. **Normalized `CatalogItemRetailerSku` table**: `(catalogItemId,
   retailerSlug, sku, productUrl?)` with unique on the first two.
   Adding a retailer is just a new slug; the cart-builder picks the
   right one based on which extension/driver is running.

Lean toward (2) — a sub-table — once we go past 2 retailers. The
schema change is:

```prisma
model CatalogItem {
  // ... existing fields
  retailerSkus CatalogItemRetailerSku[]
}

model CatalogItemRetailerSku {
  id            String      @id @default(cuid())
  catalogItemId String
  retailerSlug  String      // "homedepot", "lowes", "menards", "flooranddecor"
  sku           String
  productUrl    String?     // optional cached PDP URL
  updatedAt     DateTime    @updatedAt

  catalogItem   CatalogItem @relation(fields: [catalogItemId], references: [id], onDelete: Cascade)

  @@unique([catalogItemId, retailerSlug])
  @@index([retailerSlug, sku])
}
```

Migration notes:
- Backfill from existing `hdSku` on first deploy.
- Keep `hdSku` for one release cycle (read-through both fields), then
  drop it.

### Extension architecture

The current extension assumes a single retailer driver
(`extension/src/content/home-depot-driver.ts`). For multi-retailer:

- Move retailer-specific logic into per-retailer driver files —
  `home-depot-driver.ts`, `lowes-driver.ts`, etc. Each implements a
  common interface: `searchUrlFor(material)`, `isOnSearchPage()`,
  `isOnPdp()`, `scrapePdp()`, `scrapeSearchResults()`, `addToCart()`.
- Manifest `content_scripts.matches` lists the union of all retailer
  domains; the worker picks the right driver based on `tab.url` host.
- The contractor-app's materials-page button could either:
  - (a) Open a small picker — "Build cart at: [Home Depot] [Lowe's]
        [Floor & Decor]" — and pick the right retailer per run.
  - (b) Auto-pick based on which retailer SKUs are present on the
        material list (HD if `hdSku` is filled in for the most rows,
        Lowe's otherwise, etc.).

(a) is simpler and gives the contractor explicit control; ship that
first, layer (b) on later if the picker becomes friction.

### `/api/v1` changes

`cart-payload` already returns `hdSku`. The natural extension is:
```ts
materials: Array<{
  // ...existing fields
  retailerSkus: { homedepot?: string; lowes?: string; menards?: string; ... }
}>
```
Or — simpler given the schema choice above — a flat `Record<string,
string>`:
```ts
retailerSkus: Record<string, string>  // { homedepot: "100075069", lowes: "0123456" }
```

`match-material` and `find-alternative` are retailer-agnostic in
prompt shape — they just need a `retailer` field passed through so
the prompt can hint Claude about brand naming conventions
(McCabe vs Husky, "ProBoard" vs "DensArmor", etc).

### Receipt parser

The parser already extracts SKUs and the `parseReceiptWithClaude`
prompt mentions HD-specific format. To handle Lowe's / Menards /
F&D:
- Add the parsed `vendor` field as a hint into the catalog-update
  flow: when vendor is recognized as Lowe's, write the SKU to the
  Lowe's column / sub-table row instead of HD's.
- Update the system prompt with per-retailer SKU format hints (Lowe's
  uses 7-digit Item #s, F&D uses different conventions, etc.).

### Effort

Once the schema decision is made, the rest is mechanical:
- Schema + migration: ~1 day
- Backfill + dual-read transition: ~0.5 day
- One additional retailer driver: ~3 days (hard part is selectors
  and OOS handling on a brand-new site)
- Picker UI on materials page: ~0.5 day
- Receipt-to-correct-retailer-column wiring: ~0.5 day

**Order to ship:** Lowe's first (most common alternate for HD users),
then Menards (Midwest only but big where it operates), then Floor &
Decor (specialty — different category mix, may need a totally
different selector set since their site is closer to Wayfair than
HD). McMaster-Carr is intentionally NOT on this list — different
business, different procurement loop, probably a separate tool.
