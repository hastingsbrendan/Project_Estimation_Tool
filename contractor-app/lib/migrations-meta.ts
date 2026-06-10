/**
 * Schema-version metadata used by /api/health to detect drift between
 * the deployed code and the prod database.
 *
 * LATEST_MIGRATION must equal the newest directory name under
 * prisma/migrations. A unit test (tests/migrations-meta.test.ts) reads
 * the filesystem and fails CI if this constant falls behind — so the
 * "I forgot to bump it" failure mode is caught at the same moment a
 * new migration lands.
 *
 * LATEST_COLUMN_PROBE is a (table, column) introduced by the most
 * recent schema change. The health check probes it via
 * pragma_table_info as a tracking-table-independent fallback: even on
 * a prod DB that predates the _applied_migrations table, a missing
 * probe column means the newest migration was never applied.
 */
export const LATEST_MIGRATION = "20260513000000_w4_catalog_hd_sku"

export const LATEST_COLUMN_PROBE = {
  table: "CatalogItem",
  column: "hdSku",
} as const
