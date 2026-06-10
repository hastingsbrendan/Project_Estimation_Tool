<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Schema changes: CI auto-applies to Turso (after one-time setup)

Production runs on Turso (libsql). `prisma migrate deploy` does NOT speak `libsql://` — instead, GitHub Actions (`.github/workflows/ci.yml` at repo root) runs `scripts/migrate-prod.ts` on every push to `main` after tests pass, tracking applied migrations in an `_applied_migrations` table on Turso. Requires `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` repo secrets and a one-time `--baseline` run; until then the CI job skips with a warning and migrations must be applied by hand (old runbook still in `MIGRATIONS.md`).

When you add a migration, ALSO bump `LATEST_MIGRATION` in `lib/migrations-meta.ts` — a unit test fails if you forget, and `/api/health` uses it to report `schema: "drift"` when prod is behind.

# NEVER add a route-group-level loading.tsx

A `loading.tsx` at the `(app)` group level silently breaks every in-place server-action re-render in the group on this Next version (16.2.5): the action runs and revalidates, but the client never commits the updated tree — forms look dead until a manual reload. No console errors. Cost us ~12 hours of broken prod inline edits (discovered via E2E in CI). Skeletons are opt-in per route and only on read-only routes with no revalidate-style form actions (see `app/(app)/today/loading.tsx`).

# Errors are observable via /api/health and logged scopes

`lib/log.ts` exposes `logInfo` / `logWarn` / `logError`. When you add a server action or route handler that does anything non-trivial (DB write, external API, upload, PDF render), wrap the work in a try/catch + `logError(SCOPE, e, context)`. The scope is what makes the log line searchable in Vercel.

Triage runbook: `TRIAGE.md`. Health endpoint: `/api/health`.

# Subcontractor PII is encrypted; key lives in env

`SUBCONTRACTOR_PII_KEY` (32 bytes base64) is required for the `/subs/[id]` tax-id field and the `/subs/1099` page. Without it: tax-id editing is disabled with a friendly notice, and 1099 generation returns 503 with a clear "set the key" message. `lib/crypto/secret-box.ts` is the only file that touches the key — it never leaves the encrypt/decrypt boundary. See `lib/pdf/form-1099-nec.tsx` for the 1099 layout (substitute form, Copies B/C/2 — Copy A files separately through IRS FIRE / Track1099).

Generate a key:
```
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

# Tests are how we close the feedback loop

Two layers, both fast:

- `npm test` — vitest unit tests (`tests/*.test.ts`) for pure helpers
- `npm run test:e2e` — Playwright drives a real production build of the app on `:3100` against a separate `test.db`. This is the layer that catches Server-Component / event-handler / serialization bugs that ONLY surface in `next start`, not `next dev`.

Always run `npm test` after changing `lib/`. Run `npm run test:e2e` after changing any page in `app/` or any server action. The QA agent at `.claude/agents/qa-engineer.md` audits coverage, writes new tests, and runs the suite when invoked. Full runbook: `TESTING.md`.
