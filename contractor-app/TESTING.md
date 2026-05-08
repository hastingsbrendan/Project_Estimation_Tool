# Testing runbook

Two layers, both fast enough to run on every meaningful change.

## TL;DR

```bash
npm test              # vitest unit tests — pure logic, ~2 s
npm run test:e2e      # Playwright against a real prod build — ~90 s on cold
npm run test:all      # both, in order
```

Or ask Claude:

> "Run the QA agent on the receipts feature."

The agent at `.claude/agents/qa-engineer.md` audits coverage, writes new tests, runs them, and reports findings.

## Layer 1: Unit tests (vitest)

Lives in `tests/*.test.ts`. Covers pure functions:

- `tests/calc.test.ts` — `lib/calc.ts` math
- `tests/materials.test.ts` — `lib/materials.ts` aggregation
- `tests/error-utils.test.ts` — `lib/error-utils.ts` formatting

Add a test here whenever you add a pure helper. They run in milliseconds and never touch a database or network.

```bash
npm test            # one shot
npm run test:watch  # re-run on file change
```

## Layer 2: E2E tests (Playwright)

Lives in `tests/e2e/*.spec.ts`. Each spec drives a real browser against a real production build of the app.

Why a prod build? Because today's `Event handlers cannot be passed to Client Component props` bug only surfaces in production. Dev tolerates it. The whole point of this layer is to catch prod-only issues before deploy.

### How it's wired

- `playwright.config.ts` — runs `npm run start` on port 3100. `globalSetup` resets `test.db`, applies migrations, and seeds the test user.
- `tests/e2e/seed-user.ts` — creates a known user + Auth.js session row.
- `tests/e2e/auth-helpers.ts` — `loginAsTestUser(context)` injects the session cookie. Tests skip the magic-link flow.
- `tests/e2e/global-setup.ts` — runs once per `npm run test:e2e`. Wipes `test.db`, migrates, seeds, and triggers `npm run build` if `.next` doesn't exist.

### Specs

| File | What it covers |
|---|---|
| `smoke.spec.ts` | Visits every authed page + every public page. Asserts `< 400` status and no error boundary. **This is the test that catches Server-Component-can't-pass-onClick-style bugs.** |
| `projects.spec.ts` | Project create + edit + add line item flow |
| `proposal.spec.ts` | Contractor edits proposal, customer signs from incognito, contractor sees acceptance, expired proposal shows expiry notice |
| `receipts.spec.ts` | Receipt upload modal + body-size + validation gates |

Add a new spec when:

- A new top-level page lands → add it to `smoke.spec.ts`'s `pages` array
- A multi-step user journey is part of the dogfood loop → new `*.spec.ts`
- A bug fix landed that you want to defend against regressing → comment the test with the commit hash so future devs know why

### Running

```bash
npm run test:e2e            # full suite, headless
npm run test:e2e:ui         # Playwright UI mode — step through interactively
npm run test:e2e:debug      # one test at a time, with the inspector

# After a failure:
npx playwright show-report  # opens HTML report with traces, screenshots, video
```

Cold start runs `npm run build` (~30 s) before the suite. Subsequent runs reuse `.next` — delete it manually to force a rebuild.

### When E2E breaks for non-bug reasons

- **`Cannot connect to localhost:3100`** — port already in use, or a previous `next start` is hanging. `lsof -i :3100` then kill it.
- **`Migrations not applied`** — delete `test.db` and rerun.
- **`User not found / 401`** — the seed didn't run; check `tests/e2e/seed-user.ts` output.
- **Random snapshot drift** — none of our tests use snapshots; if you see one, that's a smell.

## Layer 3: Manual prod smoke (the QA agent runs this on demand)

After a deploy lands, hit:

1. `https://<prod>/api/health` → `{ "ok": true, "db": "ok" }`
2. Open `/projects` → list renders
3. Open any project's `/proposal` → editor renders
4. The QA agent will walk these for you when invoked with "smoke-test prod".

## Conventions

- **No `.only` / `.skip` in committed code.** Use them locally; remove before commit.
- **No live network.** Anthropic, Resend, Vercel Blob, the feedback webhook — all should be unset in test env so actions take the "not configured" branch.
- **Tests defend against specific bugs.** When a test exists because of a regression, comment it with the commit hash and a one-liner. Future you will thank you.
- **One concept per test.** Easier to diagnose the failure.

## When NOT to add a test

- Doc-only changes
- Pure config tweaks that don't change behavior
- One-off scripts you'll delete next week
- CSS/copy adjustments

The QA agent is opinionated about this — it'll push back if you ask for tests where they don't earn their maintenance cost.
