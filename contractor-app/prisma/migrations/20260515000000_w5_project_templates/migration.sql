-- W5: project templates. A template is a Project flagged isTemplate=1 —
-- hidden from normal lists, offered as a starting point on /projects/new.
ALTER TABLE "Project" ADD COLUMN "isTemplate" BOOLEAN NOT NULL DEFAULT false;
