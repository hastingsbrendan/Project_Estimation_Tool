# Triage runbook

When something breaks in production, this is the order of operations.
Most issues land in step 2 or 3.

## 1. Is the platform alive?

```
GET https://<your-prod-host>/api/health
```

Returns JSON like:

```json
{
  "ok": true,
  "status": "ok",            // "ok" | "degraded" | "down"
  "db": "ok",                // or "error"
  "dbError": null,
  "env": {
    "DATABASE_URL": true,
    "DATABASE_AUTH_TOKEN": true,
    "AUTH_SECRET": true,
    "BLOB_READ_WRITE_TOKEN": true,
    "ANTHROPIC_API_KEY": true,
    "RESEND_API_KEY": true
  }
}
```

If `status` is `"down"` → DB is unreachable. Check Turso dashboard.
If any `env` field is `false` → that feature won't work. Add the env var
in Vercel and redeploy.

## 2. The user saw "Something went wrong" with a digest

The error.tsx boundaries show:

- A short message
- The Next.js **digest** (a deterministic hash of the error)
- A "Report this" button that pushes the page + digest to your feedback
  webhook

**To find the matching server log:**

1. Open Vercel → Deployments → most recent → Functions
2. Click the function the user was hitting (path is in the URL the user
   was on; e.g. `/api/pdf/proposal/[id]` for a proposal PDF download)
3. View Logs
4. Search for the **scope** name (e.g. `uploadReceipt`, `/api/pdf/proposal`,
   `acceptProposal`) — every error logged via `logError` includes a
   `scope` field
5. The matching log line is JSON-shaped with the full message + stack
   trace + context fields (userId, durationMs, etc.)

The digest itself is NOT logged on the server side (it's computed by Next
on render). Search by scope or by a unique substring of the message
instead.

## 3. The user saw a generic "This page couldn't load" page

That means the error came from a route segment that doesn't have a
`error.tsx` boundary above it, OR from a server action invocation where
the underlying page doesn't have `maxDuration` set high enough.

- Check `app/api/.../route.ts` for missing `export const maxDuration`
- Check the page above the failing action for an `error.tsx`

If both look right, the error is happening in the framework before our
code runs (e.g. body size limit exceeded — see `next.config.ts`'s
`serverActions.bodySizeLimit`).

## 4. Common error patterns

| Symptom | Likely cause | Fix |
|---|---|---|
| All `/projects` and project-detail pages 500 after a schema change | Turso missing the new columns | Apply the migration SQL via Turso dashboard. See `MIGRATIONS.md`. |
| Receipt upload returns "A server error occurred" with no friendly modal | Body size > `serverActions.bodySizeLimit` (currently 16 MB) — pre-action framework error | Compress the image, or raise the limit in `next.config.ts` |
| PDF download returns the dark "couldn't load" page after ~10 s | Function timeout — PDF render exceeded `maxDuration` | Confirm route has `export const maxDuration = 60` |
| AI parse never completes | `ANTHROPIC_API_KEY` not set OR Claude rate-limited | Check `/api/health` env block; check Vercel logs for `reparseReceipt` |
| Customer can't sign | Vercel Deployment Protection enabled | Vercel → Settings → Deployment Protection → off for production |
| Sign-in email never arrives | `RESEND_API_KEY` not set OR `EMAIL_FROM` domain not verified in Resend | Check `/api/health` then Resend logs |

## 5. Adding a new logged scope

When you add a new server action or route handler that does anything
non-trivial (DB write, external API call, file upload, PDF render), wrap
the work in:

```ts
import { logError, logInfo } from "@/lib/log"

const SCOPE = "myActionOrRoute"

export async function myAction() {
  const started = Date.now()
  try {
    // ... actual work ...
    logInfo(SCOPE, "Did the thing", { /* useful context */ })
    return { ok: true }
  } catch (e) {
    logError(SCOPE, e, { /* useful context */ })
    throw e // or return { ok: false, error: ... }
  }
}
```

Always include a `durationMs` on success — it makes "this is slow"
diagnoses possible later, without instrumenting twice.
