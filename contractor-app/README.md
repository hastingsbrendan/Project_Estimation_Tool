# Contractor App

Estimate, propose, and win jobs faster. Built with Next.js 16, Auth.js v5, Prisma 7, and Tailwind CSS v4.

## Setup

```bash
npm install
cp .env.example .env       # fill in AUTH_SECRET (see .env.example)
npx prisma migrate dev     # creates dev.db
npx prisma generate        # generates typed client
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Signing in (dev)

No email provider is wired in development. After submitting your email on the login page, the magic link URL is printed to the **terminal** where `npm run dev` is running. Copy and paste it into your browser to sign in.

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| Auth | Auth.js v5 — email magic links |
| ORM | Prisma 7 + libsql adapter |
| Database | SQLite (dev) → Postgres on Railway (prod) |
| Styling | Tailwind CSS v4 |
| File storage | Cloudflare R2 (W3+) |

## Current state (W1 — skeleton)

- [x] Login with email magic link (dev: link printed to terminal)
- [x] Protected `/projects` dashboard (authenticated only)
- [x] PWA manifest — installable from browser
- [ ] Project creation (W2)
- [ ] Estimation engine (W2)
- [ ] AI voice/photo capture (W3)
- [ ] Material list PDF (W4)
- [ ] Branded proposal PDF + email (W5)

## Migrating to Postgres (before production)

1. Create a Railway Postgres instance; copy the connection string.
2. In `.env`: `DATABASE_URL="postgresql://..."`
3. In `prisma.config.ts`: swap the `url` and remove the libsql client from `lib/db.ts` — use `@prisma/adapter-pg` instead.
4. Run `npx prisma migrate dev`.

## Environment variables

See [`.env.example`](.env.example) for all required variables.

---

*Planning docs: [IMPLEMENTATION_PLAN.md](../IMPLEMENTATION_PLAN.md) | [Feature inventory](../Contractor_App_Feature_Inventory.xlsx)*

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
