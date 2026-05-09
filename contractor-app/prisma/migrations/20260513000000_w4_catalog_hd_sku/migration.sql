-- W4: Add Home Depot SKU column to CatalogItem so the cart-builder
-- extension can jump straight to a PDP instead of fuzzy-searching
-- by description.
ALTER TABLE "CatalogItem" ADD COLUMN "hdSku" TEXT;
