# Contractor Estimation & Proposal App — Implementation Plan

> **Working name:** TBD (placeholder — branding deferred)
> **Status:** Planning complete, ready to build
> **Owner / sole developer:** Brendan
> **Repo:** GitHub (to be created)
> **Last updated:** May 6, 2026

---

## 1. Goal & Non-Goals

### Goal
Build a working prototype of a mobile-first app that lets a self-employed general contractor walk through a jobsite, talk and snap photos, and produce a **branded, client-ready proposal PDF** in under 15 minutes — with a usable shopping list ready for tomorrow's truck-day run.

**Initial build target:** iOS (installed PWA on iPhone). Android works as a side-effect of the PWA but iOS is the primary test surface.

### Primary success measure (early development)
The sole developer (Brendan) can use the app end-to-end on his own iPhone to produce a real, branded proposal PDF that he would actually send to a client.

*(A friends-cohort feedback round will follow once the app is stable; that rollout plan is held in §7 for later activation but is not the immediate goal.)*

### Non-goals (explicitly OUT for the initial build)
- Public launch / marketing
- App store distribution (PWA only — add an iOS Capacitor wrapper later in Phase 4)
- Payments / billing (Stripe)
- Multi-user workspaces or team RBAC
- SOC2 / formal compliance
- QuickBooks or any accounting integrations
- Hosted client e-signature (deferred to Phase 2 — clients sign paper or reply "approved")

---

## 2. Target Users

| Attribute | Profile |
|---|---|
| Role | Self-employed GC, owner-operator, or 1–3 person crew |
| Project mix | Residential remodel: kitchen, bath, deck, addition, basement |
| Avg project size | $5k–$80k |
| Current tooling | Pen + paper, Excel, Word docs, sometimes Buildertrend/Houzz Pro (and complain about it) |
| Mobile platform | Mix of iPhone + Android (PWA covers both) |
| Tech comfort | Low–medium; will not tolerate a learning curve |

---

## 3. Recommended Stack

| Layer | Choice | Why for friends-prototype |
|---|---|---|
| Frontend | **Next.js 14 (App Router) as a PWA** | Single codebase, installable on phone home screen, no app store. Camera + mic work in mobile Safari/Chrome. |
| Backend | Next.js Route Handlers + **Postgres on Railway** ($5/mo) | Trivial deploy; no Supabase complexity needed for 10 users |
| ORM | **Prisma** | Type-safe, easy migrations |
| Auth | **Auth.js (NextAuth)** with email magic links via **Resend** | Free tier covers this; no password storage |
| File storage | **Cloudflare R2** | $0–1/mo at this scale; S3-compatible |
| AI — speech | **OpenAI Whisper** (speech-to-text) | Anthropic doesn't offer ASR; Whisper is best-in-class on noisy jobsite audio. **Isolated to one route handler so a swap is easy.** |
| AI — text + vision | **Anthropic Claude (Sonnet/Opus)** — PRIMARY | User preference. Strong tool-use + structured output; vision good enough for receipt/photo scope extraction. Abstract behind a provider interface from day one. |
| AI — image generation (Phase 3 only) | **Provider TBD** — Anthropic does NOT generate images. Candidates: Google Imagen, OpenAI gpt-image-1, Stability SDXL+ControlNet, Flux | Decision deferred until Phase 3. Pick on quality + cost. |
| PDF | `@react-pdf/renderer` server-side | Pure JS, branded output, no headless Chrome cost |
| Email | **Resend** | Magic links + proposal delivery |
| Hosting | **Vercel** (free tier) | Zero-config Next.js deploy |
| Errors | Console + Slack/Discord webhook (Sentry deferred to Phase 2) | Simple enough for 10 users |
| CI | GitHub Actions on push (lint + typecheck + Vitest) | Standard |

**Estimated monthly cost target:** **<$25/mo total** (Railway $5 + Anthropic API ~$5–15 + Whisper ~$1–3 + everything else free tier).

### AI provider abstraction (build this from day 1)

Wrap every AI call behind an interface so the choice can change without rewrites:

```ts
// lib/ai/provider.ts
export interface AiProvider {
  transcribe(audio: Blob): Promise<string>;
  extractScopeFromText(transcript: string, catalog: CatalogItem[]): Promise<LineItem[]>;
  extractScopeFromPhotos(photos: Photo[], catalog: CatalogItem[]): Promise<LineItem[]>;
  parseReceipt(image: Blob): Promise<ReceiptData>;
}
```

Default implementations:
- `transcribe` → OpenAI Whisper
- `extractScopeFromText` → **Anthropic Claude** (tool use / structured output)
- `extractScopeFromPhotos` → **Anthropic Claude** (vision)
- `parseReceipt` → **Anthropic Claude** (vision)

Keep `transcribe` and the others as separately-swappable concerns so Whisper can be replaced (e.g., with self-hosted whisper.cpp, Deepgram, or Groq) without touching the scope-extraction code.

### Stack rationale (deliberately rejected for this scope)
- **React Native / Expo** — overkill; PWA is sufficient for iOS-first prototype and avoids App Store setup
- **Supabase** — Postgres + Prisma + Auth.js gives equivalent capability with less to learn
- **Stripe** — no payments in prototype
- **DocuSign** — no e-sign in MVP; Phase 2 adds custom signing page
- **Sentry** — deferred to Phase 2 (not needed for solo-developer dogfood)
- **Monorepo (Turborepo / Nx)** — single Next.js app is fine until launch
- **OpenAI as primary text/vision model** — Anthropic preferred per owner; OpenAI used only for Whisper (no Anthropic equivalent) and possibly for Phase 3 image-gen

---

## 4. Repository Structure

```
contractor-app/
├── app/
│   ├── (auth)/
│   │   └── login/page.tsx
│   ├── (app)/
│   │   ├── projects/page.tsx
│   │   ├── projects/[id]/page.tsx
│   │   ├── projects/[id]/estimate/page.tsx
│   │   ├── projects/[id]/proposal/page.tsx
│   │   └── projects/[id]/materials/page.tsx
│   ├── (public)/
│   │   └── proposal/[token]/page.tsx     # client-viewable proposal link
│   ├── api/
│   │   ├── auth/[...nextauth]/route.ts
│   │   ├── ai/voice/route.ts             # Whisper + GPT-4o
│   │   ├── ai/photo/route.ts             # GPT-4o vision
│   │   ├── pdf/proposal/route.ts         # React PDF render
│   │   ├── pdf/materials/route.ts        # Shopping-list PDF
│   │   └── feedback/route.ts             # in-app feedback → Slack/Discord
│   └── layout.tsx
├── lib/
│   ├── calc.ts                           # PURE pricing engine (heavily tested)
│   ├── ai/
│   │   ├── provider.ts                   # AiProvider interface (Anthropic primary)
│   │   ├── anthropic.ts                  # Claude implementation (primary)
│   │   ├── openai.ts                     # Whisper-only by default; full impl as fallback
│   │   ├── voice.ts                      # orchestration: Whisper → Claude
│   │   ├── photo.ts                      # Claude vision
│   │   └── prompts.ts                    # versioned prompt templates
│   ├── pdf/
│   │   ├── proposal.tsx                  # React PDF document
│   │   └── materials.tsx                 # Shopping list PDF
│   └── db.ts                             # Prisma client
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── seeds/
│   └── cost_catalog.json                 # ~300 line items, 6 trades
├── public/
│   ├── manifest.json                     # PWA manifest
│   └── icons/                            # PWA icons
├── tests/
│   ├── calc.test.ts                      # Vitest, ~40 cases
│   ├── ai-prompts.test.ts                # golden-set fixtures
│   └── e2e/
│       └── create-proposal.spec.ts       # Playwright critical path
├── .env.example
├── package.json
├── tsconfig.json
├── README.md
└── IMPLEMENTATION_PLAN.md  ← this file
```

---

## 5. Phased Feature Plan

The full feature inventory (69 items, prioritized + sized + with dependencies) lives in **`Contractor_App_Feature_Inventory.xlsx`** in this folder. Open that file for the canonical list and to update statuses as work progresses.

### Phase summary

| Phase | Features | Effort points* | Theme |
|---|---|---|---|
| **MVP** | 21 (P0) | ~71 pts | Estimate → Material List → Branded PDF |
| **Phase 2** | 28 (P1) | ~120 pts | Signing, materials POs, **receipt reader**, scheduling, time, invoicing, **1099s** |
| **Phase 3** | 6 (P2) | ~52 pts | **3D scan + AI before/after visualization** |
| **Phase 4** | 14 (P3) | ~98 pts | QuickBooks, Stripe, app stores, marketing, **autonomous agents**, shared catalog (backlog) |

\* Effort points: S=1, M=3, L=7, XL=12.

### MVP feature highlights (P0 — 21 features)
- **Auth:** email magic link, single-user workspace
- **Projects:** create, client info, jobsite photos
- **Estimation:** sections/rooms, line items, **pure calc engine**, duplicate, drag-reorder
- **AI Capture:** voice → line items, photo → line items, mandatory "AI suggested" review-gate, per-project cost cap
- **Catalog:** ~300 seeded items across 6 trades, custom items, save-as-template
- **MAT-01 Material List per project** (moved up from Phase 2): auto-derived shopping list, editable, exportable as PDF + shareable link
- **Proposals:** scope/exclusions/payment-schedule builder, branded PDF (logo + brand color), email to client

### Phase 2 highlights (P1 — 28 features)
- **Hosted client signing page** + audit log (moved down from MVP)
- **Sentry + in-app feedback** (moved down from MVP)
- **Materials:** supplier prices, PO PDFs
- **Receipt & order-confirmation reader (NEW)** — 6 features:
  - Capture photo/PDF, dedicated email-forward inbox, OCR + GPT-4o vision parse, project matching, actual-vs-estimated reconciliation, project-level export
  - Supports Home Depot, Lowe's, Menard's, Ace, Amazon, generic lumberyards
- **Scheduling:** project calendar, sub assignments, SMS/email reminders
- **Time tracking:** crew clock-in/out, hours roll-up vs. estimated
- **Invoicing:** proposal→invoice, progress billing, payment-link placeholder (Stripe is Phase 4)
- **Change orders:** builder + re-sign flow
- **1099 / Tax (5 features):** sub W-9 capture (encrypted EIN/SSN), payment ledger by year, 1099-NEC PDF (Copies B/C/2), year-end bulk packet, 1096 transmittal
- **Client portal** (view-only) + threaded comments

### Phase 3 highlights (P2 — 6 features) — Visualization
- **3D room scan** (LiDAR via WebXR + photogrammetry fallback)
- 3D web viewer (three.js / react-three-fiber)
- Annotate model with line items
- Before-photo capture & alignment
- **AI-generated "after" photo** (with mandatory watermark + ToS disclaimer)
- Side-by-side before/after slider in proposal + client view

### Phase 4 highlights (P3 — 14 features) — Productize
QuickBooks Online sync · multi-user team roles · Stripe billing · iOS App Store (Capacitor) · Android Play Store (Capacitor) · marketing site · help center · SOC2-lite hardening · multi-tenant security audit · onboarding wizard.

**Autonomous agents (NEW — 3 features):**
- **AGT-01 Material-buying agent + delivery tracking** — reads the project material list, places orders with supported suppliers (start with Home Depot Pro), tracks delivery status, alerts on backorder.
- **AGT-02 Bid-send + follow-up agent** — sends approved proposals to clients and follows up on a configurable cadence (e.g., D+3, D+7, D+14) until accepted, declined, or signed.
- **AGT-03 Sub-estimate request agent** — emails scope packets to selected subs in a trade, collects responses, presents a side-by-side comparison, and nudges non-responders.

**Shared catalog (backlog, CAT-04):** Optional opt-in community catalog where contractors share + improve item defaults; per-user overrides preserved. **Prototype stays isolated**; revisit only if friends ask for it.

---

## 6. Build Order — 6-Weekend MVP Sprint

Target: a working PWA installed on Brendan's iPhone that produces a real proposal end-to-end. Test exclusively on iOS Safari (installed PWA mode) for the initial build; Android verification happens later.

| Weekend | Deliverable | Acceptance |
|---|---|---|
| **W1 — Skeleton** | GitHub repo created. Next.js + Auth.js magic link + Prisma + Postgres on Railway + Vercel deploy. PWA manifest + iOS install icons. | Brendan visits the URL on his iPhone, adds to home screen, logs in via magic link, sees an empty dashboard. |
| **W2 — Estimation core** | Project CRUD, sections, line items, **calc engine + Vitest tests**, seed catalog (~300 items, 6 trades). | Manually create a real estimate end-to-end on iPhone. Calc totals match an Excel cross-check. |
| **W3 — AI capture** *(riskiest — prototype FIRST)* | **AI provider abstraction** in place. Voice upload → Whisper → **Claude structured output** → suggested line items. Photo flow via Claude vision. **AI Suggested badge + confirm UX (AI-03)**. | Record a 60-second voice memo of a kitchen scope on iPhone; ≥1 line item appears mapped to catalog. |
| **W4 — Materials (MAT-01)** | Auto-derived material list from line items, editable, **exportable as shopping-list PDF**, shareable read-only link. | Generate the shopping list for an actual next job and use it on a Home Depot run. |
| **W5 — Proposal + PDF + email** | Proposal builder (cover, scope, exclusions, payment schedule), React PDF with logo + brand color, Resend email send to client. | Send a branded PDF proposal to your own email; renders correctly on iOS Mail. |
| **W6 — Polish + dogfood** | In-app feedback button → Slack/Discord webhook, basic empty/error states, onboarding text, fix top 5 dogfood pain points. | Brendan writes a real estimate with the app and sends a real proposal. |

**After W6:** stabilize, then activate the friends rollout in §7.

---

## 7. Friends Rollout *(deferred — activate after solo dogfood is stable)*

This section is **on hold** during the initial build. Brendan ships and dogfoods the MVP solo first; only after the app is stable on his own bids do we invite the contractor friends. Plan retained below for when it's time.

### Onboarding protocol (when activated)
- **1-on-1 in person or 30-min screenshare** for each friend. Pre-seed their workspace with their logo + 1 sample project so the app is never empty.
- Walk them through their **own next real estimate** during the call. Watch silently — note every place they hesitate or ask "wait, how do I…?"
- Don't fix bugs over text. Note them, fix in batch.

### Feedback cadence (4 weeks)
- **Week 1:** 15-min call on day 7. "What was confusing? What was missing? Did you actually use it?"
- **Weeks 2–4:** weekly 15-min calls.
- Single shared Notion or Google Doc tracker. Every reported issue gets a row → triaged into the **Excel inventory** (`I-Features` tab) as a new feature row or a note on existing.

### Communication channel
Slack/Discord shared channel for asynchronous bug reports + the in-app "Send feedback" button.

---

## 8. Success Criteria

### Initial build (solo)
| Gate | Target |
|---|---|
| **Self-activation** | Brendan writes ≥3 real estimates with the app and sends ≥1 real proposal to a real client within 30 days of W6 |
| **Time-to-proposal** | <15 min from "start project" to "PDF in client's inbox" on at least one bid |
| **Trust on AI** | <10% of AI-suggested line items rejected during the confirm step (after W3 prompt-tuning on Claude) |
| **Proposal quality** | Zero proposals require redo in another tool because of formatting/branding issues |

### Friends rollout (later)
Targets when the friends cohort is activated:

| Gate | Target |
|---|---|
| **Activation** | ≥3 of 5–10 friends complete and **send ≥1 real proposal** within 30 days |
| **Pull signal** | ≥1 friend says **unprompted** "I'd pay for this" or "when can I have the next version" |
| **Improvement clarity** | Prioritized list of **10+ improvements** captured in the inventory after 30 days |

---

## 9. Verification Strategy

### Automated tests
- **Unit — `lib/calc.ts`** (Vitest): every pricing edge case — zero qty, 100% markup, tax rounding, negative discount, mixed labor + material rows. Target 100% branch coverage on the calc module.
- **AI golden-set tests** (Vitest fixtures): 10–15 voice transcripts + 5 photo prompts → expected line-item categories. Alert on regression >10%.
- **E2E — Playwright** (`tests/e2e/`): create project → record voice → review items → send proposal → client opens public link. One critical-path test, run on every push.
- **Multi-user isolation test**: even though MVP is single-user, a Playwright test creates 2 accounts and proves account A can't read account B's projects.

### Manual / dogfood
- **Founder dogfood**: write 3 real estimates with the app vs. the same 3 in the existing tool (Excel/paper). Log time taken and final $ delta.
- **Friend cohort review**: weekly 15-min calls (per Section 7).

### Pre-flight checklist before sending the prototype to any friend
- [ ] Magic link login works on iOS Safari + Android Chrome
- [ ] Camera + microphone permissions prompt correctly
- [ ] Voice memo round-trip <30s on good wifi
- [ ] Branded PDF renders identically on macOS Preview + iOS Mail + Gmail web
- [ ] Material list export PDF is printable on standard US-Letter
- [ ] In-app feedback button delivers to Slack/Discord
- [ ] Sample project is pre-seeded in their workspace

---

## 10. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| AI line items wrong → friend sends bad proposal | High | High | **Hard review-gate UX (AI-03)**; "AI suggested" badge; cannot send proposal with unconfirmed items; clear ToS disclaimer |
| PWA camera/mic permissions confusing on iOS | Medium | Medium | Pre-flight permission check screen during onboarding; manual-entry fallback always available |
| Cross-user data leak (even friends don't want their bids visible to other friends) | Low | High | App-level scoping by `userId` on every query; Playwright isolation test gates every deploy |
| OpenAI cost runaway | Medium | Low | Per-user daily token cap (AI-04); alert if any user exceeds $5/day |
| Friend forgets the app exists | High | Medium | Weekly "what'd you bid this week?" nudge during the 4-week feedback window |
| iOS PWA limitations (audio recording quirks, no push) | Medium | Medium | Test on actual iPhones early; document workarounds |
| Brand-color PDF rendering mismatches preview | Low | Medium | Use React PDF (deterministic) not headless Chrome; visual snapshot tests on a few sample logos |
| Catalog inaccurate pricing in seeded items | Medium | Low | Mark all defaults as "user must verify"; make custom catalog items easy to add (CAT-02) |

---

## 11. Phase-Specific Design Notes (For Later)

### Phase 2 — Receipt & Order-Confirmation Reader (REC-01 to REC-06)
- **Inbound email setup:** Use **Postmark Inbound** or **SendGrid Inbound Parse**. Each user gets a unique forwarding address (e.g., `receipts+ab12cd@yourapp.com`). Verify SPF/DKIM on the receiving domain to avoid spam classification.
- **Supported sources at launch:** Home Depot, Lowe's, Menard's, Ace Hardware, Amazon Business, generic lumberyards (text fallback).
- **Parsing pipeline:** raw email or photo → store original → run through GPT-4o vision with a strict JSON schema (`store`, `date`, `total`, `tax`, `items[]`) → store extracted JSON alongside original.
- **Match-to-project:** AI suggests project based on date proximity + total $ matching outstanding material estimates; user confirms one-tap.
- **Reconciliation:** material variance dashboard at project level — flag any line item where actual > 110% of estimated.

### Phase 2 — 1099 Generation (TAX-01 to TAX-05)
- **Threshold:** $600/yr per non-corporate sub (current IRS rule, 2026 — verify with CPA before launch).
- **PII storage:** EIN/SSN encrypted at rest with `pgcrypto` or libsodium; access logged; never returned by default API responses.
- **PDF generation:** Render IRS-aligned 1099-NEC layout for **Copies B / C / 2** (the recipient and state copies).
- **Copy A (IRS copy):** **Do NOT print Copy A from this app.** The IRS requires red-ink scannable Copy A for paper filing. Direct user to **e-file via IRS FIRE** or a service like **Track1099 / Tax1099.com**. The app generates the data file (and the recipient copies); the user submits Copy A through an IRS-approved channel.
- **1096 transmittal:** Only relevant if user paper-files Copy A — most won't; offer as optional output.

### Phase 3 — Visualization (VIZ-01 to VIZ-06)
- **3D scan availability:** LiDAR is iPhone Pro / iPad Pro only as of 2026. Photogrammetry fallback (8–12 photos → mesh via cloud service like Luma AI or in-house pipeline) covers everything else but is lower quality. Make 3D **opt-in per project**.
- **AI "after" image generation:** Cost is meaningful (~$0.05–0.15/image). Cap regenerations per proposal (e.g., 3); cache aggressively; require user to "approve for client view" before showing in proposal.
- **Disclaimers (mandatory):**
  - Watermark on every AI-generated image: *"AI-generated visualization, not a guarantee of final result"*
  - ToS line client must accept when viewing: *"Visualizations are illustrative only. Final materials, finishes, and dimensions will vary."*
- **Liability:** consult counsel before launching VIZ-05 publicly.

### Phase 4 — Productize
Defer all decisions on Stripe pricing, app store positioning, marketing, and SOC2 scope until friends-prototype feedback is in. The shape of these decisions depends entirely on what the friends say.

---

### Phase 4 — Autonomous Agents (AGT-01, AGT-02, AGT-03)

These are headline differentiators if they work. Architectural notes:

- **Build on a single shared agent runtime** (e.g., a queue + worker pattern with the AI provider's tool-use API — Anthropic Claude tool use fits well). Each agent is a defined toolset + a system prompt + a state machine.
- **Human-in-the-loop is mandatory for the first action of each agent run:**
  - AGT-01 (buy materials): user approves the cart total before any purchase.
  - AGT-02 (bid send): user approves the *initial* send; subsequent follow-ups can be auto-approved per a configured cadence.
  - AGT-03 (sub estimate request): user approves the recipient list and the scope packet before sending.
- **Idempotency + audit log on every agent action.** Every external call (purchase, email send, follow-up) writes an immutable row showing what the agent did, when, and on whose authorization.
- **Kill switch.** A single "pause all agents" button at the workspace level.
- **Cost & rate limits.** Per-agent daily action cap; alert before any spend >$100 from AGT-01.
- **Supplier coverage starts narrow.** AGT-01 launches with Home Depot Pro only (cleanest API + Pro account benefits); generalize after.

### Phase 4 — Shared Catalog (CAT-04, backlog)

Held as a backlog item per scope decision: prototype keeps catalogs isolated per user. Revisit only if friends explicitly ask for a shared / community catalog. If revived: opt-in, items flagged as "community" vs. "private", per-user overrides preserved, contributor attribution.

---

## 12. Resolved Decisions & Open Questions

### Resolved (locked in this revision)
| Topic | Decision |
|---|---|
| Initial platform | **iOS-first PWA**; Android works as a side-effect but isn't tested first-class until later |
| Developer | **Brendan, solo** for the foreseeable future |
| AI provider — text + vision | **Anthropic Claude (primary)**; OpenAI Whisper for ASR only (no Anthropic ASR exists) |
| AI provider — image-gen (Phase 3) | **Decision deferred to Phase 3.** Anthropic does not generate images. Candidates: Google Imagen, OpenAI gpt-image-1, Stability SDXL+ControlNet, Flux. Pick on quality + cost when Phase 3 starts. |
| Catalog sharing | **Isolated per user** for prototype. Shared catalog tracked as backlog item **CAT-04** (Phase 4). |
| Branding / naming | Placeholder for now — don't sink time into it yet |
| Source control | **GitHub** (Brendan to create the repo before W1) |

### Still open (decide before / during build)
1. **Repo name + GitHub org** — personal account or new org? (Affects GH Actions billing only.)
2. **Vercel + Railway accounts** — Brendan to confirm both are set up before W1.
3. **Anthropic API access** — confirm console access + billing limits before W3.
4. **Domain name** — not needed until proposal-link sharing matters (W5); a `.vercel.app` URL is fine for W1–W4.
5. **Receipts subdomain** — only relevant for Phase 2 (REC-02); decide alongside domain.

---

## 13. Out of Scope (Explicit)

The following are not in this prototype and are not promised to friends:
- Any payment processing
- App store presence
- Multi-user / team accounts
- Public marketing or sign-up funnel
- SLAs or uptime guarantees
- Data export to QuickBooks
- Customer support beyond 1-on-1 with the founder

---

## Reference Files

| File | Purpose |
|---|---|
| `Contractor_App_Feature_Inventory.xlsx` | Canonical 65-feature inventory; update statuses as work progresses |
| `build_inventory.py` | Regenerates the inventory workbook (`python build_inventory.py`) |
| `IMPLEMENTATION_PLAN.md` | This file |
| `README.md` | Folder overview |
