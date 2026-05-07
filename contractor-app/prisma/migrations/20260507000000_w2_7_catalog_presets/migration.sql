-- Service→material presets. Both ends are CatalogItem rows; cascade
-- delete when the linked catalog item is removed.
CREATE TABLE "CatalogPreset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serviceId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "defaultQty" REAL NOT NULL DEFAULT 1,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CatalogPreset_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "CatalogItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CatalogPreset_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "CatalogItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CatalogPreset_serviceId_materialId_key" ON "CatalogPreset"("serviceId", "materialId");
CREATE INDEX "CatalogPreset_serviceId_idx" ON "CatalogPreset"("serviceId");
CREATE INDEX "CatalogPreset_materialId_idx" ON "CatalogPreset"("materialId");
