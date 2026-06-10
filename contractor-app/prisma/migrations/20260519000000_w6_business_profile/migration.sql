-- W6: per-user business identity for client-facing surfaces. Replaces
-- the CONTRACTOR_* env vars so branding works per account.
CREATE TABLE "BusinessProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "businessName" TEXT,
    "tagline" TEXT,
    "licenseNumber" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "logoUrl" TEXT,
    "logoPathname" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BusinessProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "BusinessProfile_userId_key" ON "BusinessProfile"("userId");
