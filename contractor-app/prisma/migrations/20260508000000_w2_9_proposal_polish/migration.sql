-- Proposal polish: customer-facing fields. estStartWindow/estDuration are
-- free-form so the contractor can set "Within 2 weeks of signing" / "3-4
-- weeks". validForDays defaults to 30 — used to compute a valid-until date
-- on the public proposal page so the customer sees an expiry.
ALTER TABLE "Project" ADD COLUMN "estStartWindow" TEXT;
ALTER TABLE "Project" ADD COLUMN "estDuration" TEXT;
ALTER TABLE "Project" ADD COLUMN "validForDays" INTEGER NOT NULL DEFAULT 30;
