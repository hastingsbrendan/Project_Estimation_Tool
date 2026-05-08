<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Schema changes need manual Turso migration

Production runs on Turso (libsql). `prisma migrate deploy` does NOT speak `libsql://`, and the Vercel build does NOT apply migrations. If you change `prisma/schema.prisma` and create a migration, you MUST apply the SQL to Turso by hand (Turso dashboard SQL console or `turso db shell`) before/immediately after the next deploy — otherwise every page that reads the changed table 500s with "This page couldn't load. A server error occurred."

Full runbook: `MIGRATIONS.md`. Always remind the user to apply the SQL before pushing schema changes.

# Errors are observable via /api/health and logged scopes

`lib/log.ts` exposes `logInfo` / `logWarn` / `logError`. When you add a server action or route handler that does anything non-trivial (DB write, external API, upload, PDF render), wrap the work in a try/catch + `logError(SCOPE, e, context)`. The scope is what makes the log line searchable in Vercel.

Triage runbook: `TRIAGE.md`. Health endpoint: `/api/health`.

# Tests are how we close the feedback loop

Two layers, both fast:

- `npm test` — vitest unit tests (`tests/*.test.ts`) for pure helpers
- `npm run test:e2e` — Playwright drives a real production build of the app on `:3100` against a separate `test.db`. This is the layer that catches Server-Component / event-handler / serialization bugs that ONLY surface in `next start`, not `next dev`.

Always run `npm test` after changing `lib/`. Run `npm run test:e2e` after changing any page in `app/` or any server action. The QA agent at `.claude/agents/qa-engineer.md` audits coverage, writes new tests, and runs the suite when invoked. Full runbook: `TESTING.md`.
