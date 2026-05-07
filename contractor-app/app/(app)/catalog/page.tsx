import { redirect } from "next/navigation"

/**
 * The catalog is split into two pages: /catalog/materials and /catalog/services.
 * This index just redirects to materials by default — old bookmarks still work.
 */
export default function CatalogIndex() {
  redirect("/catalog/materials")
}
