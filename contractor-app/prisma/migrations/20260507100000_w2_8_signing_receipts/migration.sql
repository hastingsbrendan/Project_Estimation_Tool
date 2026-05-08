-- Public proposal acceptance / signing fields on Project
ALTER TABLE "Project" ADD COLUMN "acceptedAt" DATETIME;
ALTER TABLE "Project" ADD COLUMN "acceptedBy" TEXT;
ALTER TABLE "Project" ADD COLUMN "acceptedIp" TEXT;
ALTER TABLE "Project" ADD COLUMN "acceptedUserAgent" TEXT;

-- Receipts captured per project (or unassigned). Parsed by Claude vision when
-- a key is configured, otherwise manually entered.
CREATE TABLE "Receipt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "imageUrl" TEXT NOT NULL,
    "imagePathname" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "size" INTEGER,
    "vendor" TEXT,
    "purchasedAt" DATETIME,
    "subtotal" REAL,
    "tax" REAL,
    "total" REAL,
    "parseStatus" TEXT NOT NULL DEFAULT 'pending',
    "parseError" TEXT,
    "parseRawJson" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Receipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Receipt_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "Receipt_userId_idx" ON "Receipt"("userId");
CREATE INDEX "Receipt_projectId_idx" ON "Receipt"("projectId");

CREATE TABLE "ReceiptItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "receiptId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" REAL NOT NULL DEFAULT 1,
    "unit" TEXT NOT NULL DEFAULT 'ea',
    "unitPrice" REAL NOT NULL DEFAULT 0,
    "lineTotal" REAL,
    "sku" TEXT,
    "matchedCatalogItemId" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ReceiptItem_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "Receipt" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReceiptItem_matchedCatalogItemId_fkey" FOREIGN KEY ("matchedCatalogItemId") REFERENCES "CatalogItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "ReceiptItem_receiptId_idx" ON "ReceiptItem"("receiptId");
CREATE INDEX "ReceiptItem_matchedCatalogItemId_idx" ON "ReceiptItem"("matchedCatalogItemId");
