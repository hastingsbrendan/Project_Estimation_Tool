# Contractor App — Home Depot cart-builder extension

Chrome MV3 extension that builds a Home Depot cart from a Contractor App project's material list. Drives search, scrapes candidates, asks the contractor app's matcher API to pick the best, flags out-of-stock items with alternatives. **Never purchases anything** — it leaves items in your cart for manual review and checkout.

## Architecture (intentionally separated from the contractor-app)

This is a **sibling project**, not a folder inside `contractor-app/`. Hard rules:

- No imports across the boundary in either direction.
- Communication only via the contractor-app's documented `/api/v1/*` endpoints.
- Has its own `package.json`, `tsconfig.json`, build chain.
- If we ever need to extract this to a separate repo, delete the `extension/` directory and the contractor-app keeps working.

## Install (development)

1. **Build it:**
   ```bash
   cd extension
   npm install
   npm run build
   ```
   Output lands in `extension/dist/`.

2. **Load it into Chrome:**
   - Open `chrome://extensions`
   - Toggle **Developer mode** (top-right)
   - Click **Load unpacked**
   - Select the `extension/dist/` directory

3. **Confirm it works:** open the contractor app at `http://localhost:3000` (dev) or your prod URL, navigate to a project's `/projects/<id>/materials` page. The "Build cart at Home Depot" button should turn from grey ("Install Chrome extension →") to orange. If not, reload the page — the bridge content script needs `document_idle`.

## Use it

1. Open a project's materials list in the contractor app.
2. Click **Build cart at Home Depot**.
3. The extension opens a Home Depot tab and renders a side panel showing each material's status as it works:
   - ✓ added — high-confidence match in stock, added to cart
   - ⚠ review — low-confidence, surfaced for you to pick manually
   - ⊗ out of stock — surfaced with alternatives (you click to accept)
4. When the loop ends, review your HD cart and check out manually. The extension never submits payment.

## Auth modes

The extension does nothing to manage Home Depot auth — whatever Chrome already has is what it uses.

- **HD Pro account logged in** → pro pricing, saved addresses
- **Anonymous** → public pricing

For the contractor-app side, auth is the user's existing session cookie. The extension's bridge content script runs on contractor-app pages, so a fetch from there carries the cookie automatically.

## Versions / scope

- **v0.1.x (current)**: scaffold only. Bridge content script announces presence, popup renders, side panel placeholder. The actual search + scrape + add-to-cart loop is Phase B.
- **v0.2.x (next)**: real HD driver. Search per material, scrape top 5 candidates, POST to `/api/v1/match-material`, decide based on confidence threshold (≥0.8 in stock → add).
- **Backlog**: split-cart across multiple stores, auto-substitution, Chrome Web Store publishing, Firefox/Safari support.

## Troubleshooting

- **Button still says "Install Chrome extension →" after install.** Reload the contractor-app page. The bridge runs at `document_idle` and may not have injected before React mounted the button.
- **HD tab doesn't open.** Check `chrome://extensions` → Errors button on the entry. Most common cause: a permissions prompt blocked.
- **"401 Unauthorized" in worker logs.** You're not logged into the contractor app in this Chrome profile. Sign in, retry.
- **Extension worked yesterday, doesn't today.** Chrome occasionally evicts MV3 service workers. Reload the extension from `chrome://extensions` and retry.

## Dev workflow

- `npm run dev` — Vite watch mode, rebuilds `dist/` on changes
- `npm run typecheck` — TS-only check, no emit
- After a change, click "Reload" on the extension card in `chrome://extensions` and reload any open contractor-app or HD tabs

## Endpoints consumed (v1, on contractor-app)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/projects/:id/cart-payload` | Project's aggregated material list |
| POST | `/api/v1/match-material` | Pick best HD candidate for a material |
| POST | `/api/v1/find-alternative` | Rank substitutes when the original is OOS |

All three: auth via session cookie, log scope `/api/v1/<route>`.
