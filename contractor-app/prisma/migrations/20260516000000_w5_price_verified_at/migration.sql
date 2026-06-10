-- W5: stamp catalog prices when a receipt confirms them. Null = the
-- price was seeded/typed and never verified against a real purchase.
ALTER TABLE "CatalogItem" ADD COLUMN "priceVerifiedAt" DATETIME;
