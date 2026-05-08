<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Schema changes need manual Turso migration

Production runs on Turso (libsql). `prisma migrate deploy` does NOT speak `libsql://`, and the Vercel build does NOT apply migrations. If you change `prisma/schema.prisma` and create a migration, you MUST apply the SQL to Turso by hand (Turso dashboard SQL console or `turso db shell`) before/immediately after the next deploy — otherwise every page that reads the changed table 500s with "This page couldn't load. A server error occurred."

Full runbook: `MIGRATIONS.md`. Always remind the user to apply the SQL before pushing schema changes.
