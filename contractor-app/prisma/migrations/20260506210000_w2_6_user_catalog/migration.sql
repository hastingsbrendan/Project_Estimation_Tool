-- Per-user catalog: drop empty CatalogItem, recreate with userId FK and audit columns
DROP TABLE IF EXISTS "CatalogItem";

CREATE TABLE "CatalogItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trade" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'ea',
    "unitPrice" REAL NOT NULL DEFAULT 0,
    "kind" TEXT NOT NULL DEFAULT 'material',
    "notes" TEXT,
    "archived" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "userId" TEXT NOT NULL,
    CONSTRAINT "CatalogItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "CatalogItem_userId_idx" ON "CatalogItem"("userId");
CREATE INDEX "CatalogItem_trade_idx" ON "CatalogItem"("trade");

-- Add catalogItemId FK to LineItem (nullable; null = hand-typed item)
ALTER TABLE "LineItem" ADD COLUMN "catalogItemId" TEXT REFERENCES "CatalogItem" ("id") ON DELETE SET NULL;
CREATE INDEX "LineItem_catalogItemId_idx" ON "LineItem"("catalogItemId");
