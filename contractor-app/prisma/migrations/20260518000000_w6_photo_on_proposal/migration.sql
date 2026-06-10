-- W6: opt-in flag to show a jobsite photo on the client-facing
-- proposal (public page + PDF).
ALTER TABLE "Photo" ADD COLUMN "showOnProposal" BOOLEAN NOT NULL DEFAULT false;
