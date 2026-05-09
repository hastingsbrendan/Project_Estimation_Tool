/**
 * Home Depot content script — drives the per-material loop on a HD tab.
 *
 *   1. Worker sends { type: "drive-material", material }
 *   2. Driver navigates to /s/<query>, waits for results, scrapes top 5
 *      cards (title, price, sku, stock, url, brand, pack hints)
 *   3. Driver POSTs candidates back to the worker → /api/v1/match-material
 *      (Claude picks bestIdx + confidence)
 *   4. If confidence >= 0.8 AND inStock -> navigate to PDP and click
 *      Add to Cart. Otherwise tag the item for review.
 *   5. If matched candidate is OOS -> driver scrapes more candidates from
 *      results, asks /api/v1/find-alternative, surfaces in side panel.
 *
 * Selectors are intentionally tolerant. HD's DOM has data-testid
 * attributes on every important element (product-pod, atc-button, etc.)
 * — we prefer those, fall back to class-based queries, and bail loudly
 * with a structured "no-match" rather than guessing wrong.
 *
 * The driver renders its own side-panel overlay via shadow DOM so HD's
 * styles can't interfere.
 */

import type { Candidate, Material, RunItem, RunItemStatus } from "../shared/types"

// ─────────────────────────────────────────────────────────────────────────
// Side panel — shadow DOM overlay
// ─────────────────────────────────────────────────────────────────────────

const PANEL_HOST_ID = "contractor-app-cart-side-panel-host"

type PanelState = {
  projectName: string | null
  items: RunItem[]
  phase: "idle" | "running" | "done" | "error"
  errorMessage?: string
}

let panelState: PanelState = {
  projectName: null,
  items: [],
  phase: "idle",
}

function ensurePanel(): ShadowRoot {
  let host = document.getElementById(PANEL_HOST_ID) as HTMLDivElement | null
  if (host?.shadowRoot) return host.shadowRoot
  host = document.createElement("div")
  host.id = PANEL_HOST_ID
  Object.assign(host.style, {
    position: "fixed",
    top: "12px",
    right: "12px",
    zIndex: "2147483646",
  } satisfies Partial<CSSStyleDeclaration>)
  document.body.appendChild(host)
  const root = host.attachShadow({ mode: "open" })
  root.innerHTML = `
    <style>
      :host { all: initial; }
      .panel {
        font-family: system-ui, -apple-system, sans-serif;
        font-size: 13px; color: #18181b;
        background: white; border: 1px solid #d4d4d4;
        border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.12);
        width: 340px; max-height: calc(100vh - 24px); overflow: auto;
        padding: 12px;
      }
      header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; }
      h1 { font-size: 14px; margin: 0; }
      .close { background: none; border: none; cursor: pointer; font-size: 16px; color: #71717a; }
      .phase { font-size: 11px; color: #71717a; margin-bottom: 8px; }
      ul { list-style: none; margin: 0; padding: 0; }
      li { padding: 6px 0; border-bottom: 1px solid #f4f4f5; font-size: 12px; }
      li:last-child { border-bottom: none; }
      .desc { color: #18181b; }
      .meta { color: #52525b; font-size: 11px; margin-top: 2px; }
      .pill { display: inline-block; padding: 1px 6px; border-radius: 999px; font-size: 10px; font-weight: 600; margin-right: 4px; }
      .pill-pending { background: #f4f4f5; color: #71717a; }
      .pill-searching { background: #fef3c7; color: #92400e; }
      .pill-added { background: #d1fae5; color: #065f46; }
      .pill-review { background: #fef3c7; color: #92400e; }
      .pill-oos { background: #fee2e2; color: #991b1b; }
      .pill-error { background: #fee2e2; color: #991b1b; }
      .pill-no-match { background: #f4f4f5; color: #71717a; }
      .alt-block { margin-top: 4px; padding: 6px; background: #fef3c7; border-radius: 4px; }
      .alt-row { display: flex; justify-content: space-between; align-items: center; padding: 2px 0; }
      a { color: #ea580c; text-decoration: none; }
      a:hover { text-decoration: underline; }
    </style>
    <div class="panel">
      <header>
        <h1>Cart builder</h1>
        <button class="close" data-action="close">×</button>
      </header>
      <div class="phase" data-slot="phase">Idle</div>
      <ul data-slot="items"></ul>
    </div>
  `
  root.querySelector('[data-action="close"]')?.addEventListener("click", () => {
    host?.remove()
  })
  return root
}

function pillForStatus(s: RunItemStatus): string {
  switch (s.kind) {
    case "pending":
      return `<span class="pill pill-pending">pending</span>`
    case "searching":
      return `<span class="pill pill-searching">searching…</span>`
    case "matched":
      return `<span class="pill pill-searching">matched, adding…</span>`
    case "added":
      return `<span class="pill pill-added">✓ added</span>`
    case "review":
      return `<span class="pill pill-review">⚠ review</span>`
    case "oos":
      return `<span class="pill pill-oos">⊗ out of stock</span>`
    case "no-match":
      return `<span class="pill pill-no-match">no match</span>`
    case "error":
      return `<span class="pill pill-error">error</span>`
  }
}

function statusDetail(s: RunItemStatus): string {
  switch (s.kind) {
    case "matched":
    case "added":
      return `<a href="${s.candidate.url}" target="_blank">${escapeHtml(s.candidate.title)}</a>${
        s.kind === "matched" ? ` · ${(s.confidence * 100).toFixed(0)}%` : ""
      }`
    case "review":
      return `${escapeHtml(s.reasoning)}`
    case "oos":
      return `${escapeHtml(s.candidate.title)}${
        s.alternatives && s.alternatives.length > 0
          ? `<div class="alt-block"><strong>Alternatives:</strong>${s.alternatives
              .map(
                (a) =>
                  `<div class="alt-row"><a href="${a.url}" target="_blank">${escapeHtml(a.title)}</a><span>${
                    a.price != null ? `$${a.price.toFixed(2)}` : "—"
                  }</span></div>`,
              )
              .join("")}</div>`
          : ""
      }`
    case "no-match":
      return escapeHtml(s.reasoning)
    case "error":
      return escapeHtml(s.message)
    default:
      return ""
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    const map: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    }
    return map[c] ?? c
  })
}

function renderPanel() {
  const root = ensurePanel()
  const phaseSlot = root.querySelector('[data-slot="phase"]') as HTMLElement | null
  const itemsSlot = root.querySelector('[data-slot="items"]') as HTMLUListElement | null
  if (phaseSlot) {
    const counts = panelState.items.reduce(
      (acc, it) => {
        const k = it.status.kind
        acc[k] = (acc[k] ?? 0) + 1
        return acc
      },
      {} as Record<string, number>,
    )
    const summary = panelState.items.length
      ? `${counts.added ?? 0} added · ${(counts.review ?? 0) + (counts.oos ?? 0)} need review · ${counts["no-match"] ?? 0} no match`
      : "Idle"
    phaseSlot.textContent =
      panelState.phase === "error" && panelState.errorMessage
        ? `Error: ${panelState.errorMessage}`
        : panelState.projectName
          ? `${panelState.projectName} · ${summary}`
          : summary
  }
  if (itemsSlot) {
    itemsSlot.innerHTML = panelState.items
      .map(
        (it) => `<li>
          ${pillForStatus(it.status)}
          <span class="desc">${escapeHtml(it.material.description)}</span>
          <div class="meta">${it.material.quantity} ${escapeHtml(it.material.unit)} · ${statusDetail(it.status)}</div>
        </li>`,
      )
      .join("")
  }
}

function setItemStatus(idx: number, status: RunItemStatus) {
  if (panelState.items[idx]) {
    panelState.items[idx].status = status
    renderPanel()
  }
}

// ─────────────────────────────────────────────────────────────────────────
// HD DOM scraping
// ─────────────────────────────────────────────────────────────────────────

const SEARCH_URL = (q: string) =>
  `https://www.homedepot.com/s/${encodeURIComponent(q)}`

/**
 * Pick a search URL for a material:
 *   - if the contractor saved an HD SKU, search by SKU. HD's search
 *     redirects to the exact PDP for an exact SKU match — much more
 *     reliable than description fuzzy matching.
 *   - otherwise fall back to the description.
 */
function searchUrlFor(material: Material): string {
  if (material.hdSku && material.hdSku.trim()) {
    return SEARCH_URL(material.hdSku.trim())
  }
  return SEARCH_URL(material.description)
}

function isOnSearchPageFor(material: Material): boolean {
  const target = searchUrlFor(material).split("?")[0]!
  // SKU search often redirects to a /p/ PDP URL — accept either.
  if (window.location.href.startsWith(target)) return true
  if (
    material.hdSku &&
    material.hdSku.trim() &&
    new RegExp(`/${material.hdSku.trim()}(?:[/?#]|$)`).test(window.location.href)
  ) {
    return true
  }
  return false
}

function waitFor<T extends Element = Element>(
  selector: string,
  deadlineMs = 8000,
): Promise<T | null> {
  return new Promise((resolve) => {
    const found = document.querySelector<T>(selector)
    if (found) return resolve(found)
    const start = Date.now()
    const obs = new MutationObserver(() => {
      const el = document.querySelector<T>(selector)
      if (el) {
        obs.disconnect()
        resolve(el)
      } else if (Date.now() - start > deadlineMs) {
        obs.disconnect()
        resolve(null)
      }
    })
    obs.observe(document.body, { childList: true, subtree: true })
    setTimeout(() => {
      obs.disconnect()
      resolve(document.querySelector<T>(selector))
    }, deadlineMs)
  })
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function scrapeSearchResults(limit = 5): Candidate[] {
  const cards = Array.from(
    document.querySelectorAll<HTMLElement>(
      '[data-testid="product-pod"], [class*="product-pod"]',
    ),
  ).slice(0, limit)

  const out: Candidate[] = []
  for (const card of cards) {
    const titleEl = card.querySelector<HTMLAnchorElement>(
      '[data-testid="product-pod--title"], a[data-testid*="title"], .product-title__title a, a[href*="/p/"]',
    )
    const title = titleEl?.textContent?.trim() ?? ""
    const url = titleEl?.href ?? ""
    if (!title || !url) continue

    const skuMatch = url.match(/\/p\/[^/]+\/(\d+)/)
    const sku = skuMatch?.[1] ?? ""

    const priceEl = card.querySelector<HTMLElement>(
      '[data-testid="product-pod--price"], [class*="price-format__main-price"], [class*="price__dollars"]',
    )
    const price = parsePrice(priceEl?.textContent ?? "")

    const oosText = card.textContent?.toLowerCase() ?? ""
    const inStock = !/out of stock/i.test(oosText)

    const brandEl = card.querySelector<HTMLElement>(
      '[data-testid*="brand"], [class*="brand"]',
    )
    const brand = brandEl?.textContent?.trim() || null

    const pack = extractPack(title)

    out.push({ title, sku, url, price, inStock, brand, pack })
  }
  return out
}

function parsePrice(s: string): number | null {
  if (!s) return null
  const m = s.match(/\$?\s*(\d[\d,]*\.?\d*)/)
  if (!m) return null
  const n = Number(m[1]?.replace(/,/g, "") ?? "")
  return Number.isFinite(n) ? n : null
}

function extractPack(title: string): string | null {
  const m = title.match(
    /\(?\s*(pack of \d+|\d+\s*[-]?\s*pack|\d+\s*pk\b|\d+\s*ct\b|\d+\s*lb\b|\d+\s*oz\b|\d+\s*gal\b)\s*\)?/i,
  )
  return m?.[1]?.trim() ?? null
}

// ─────────────────────────────────────────────────────────────────────────
// Cart manipulation (PDP)
// ─────────────────────────────────────────────────────────────────────────

async function addToCart(candidate: Candidate): Promise<{ ok: boolean; error?: string }> {
  if (!candidate.url) return { ok: false, error: "No URL" }
  // Caller is responsible for navigating us to the PDP; if we're elsewhere
  // bail rather than self-navigating (kills this script mid-call).
  if (window.location.href !== candidate.url) {
    return { ok: false, error: "Not on PDP — driver shouldn't self-navigate" }
  }
  const atc = await waitFor<HTMLButtonElement>(
    'button[data-testid="atc-button"], button[data-automation-id="addToCart"], button[aria-label*="Add to Cart" i]',
    8000,
  )
  if (!atc) return { ok: false, error: "Add to Cart button not found" }
  atc.click()
  await delay(800)
  return { ok: true }
}

// ─────────────────────────────────────────────────────────────────────────
// Per-material orchestration (driven by the worker)
// ─────────────────────────────────────────────────────────────────────────

async function driveMaterial(
  idx: number,
  material: Material,
  appOrigin: string,
): Promise<RunItemStatus> {
  setItemStatus(idx, { kind: "searching" })

  // Caller (worker) is responsible for navigating us here first. If we
  // somehow ended up on the wrong page, bail with no-match rather than
  // navigating ourselves — navigation kills this content script mid-call.
  if (!isOnSearchPageFor(material)) {
    return { kind: "no-match", reasoning: "Driver wasn't on the search page" }
  }

  const haveResults = await waitFor(
    '[data-testid="product-pod"], [class*="product-pod"]',
    10_000,
  )
  if (!haveResults) {
    return { kind: "no-match", reasoning: "No search results loaded" }
  }
  await delay(400)

  const candidates = scrapeSearchResults(5)
  if (candidates.length === 0) {
    return { kind: "no-match", reasoning: "Couldn't scrape any candidate cards" }
  }

  const matchResp = await chrome.runtime.sendMessage({
    type: "match-material",
    appOrigin,
    material,
    candidates,
  })

  if (
    !matchResp ||
    typeof matchResp !== "object" ||
    !("ok" in matchResp) ||
    !matchResp.ok
  ) {
    return {
      kind: "error",
      message: (matchResp as { error?: string })?.error ?? "match-material failed",
    }
  }
  const result = (
    matchResp as { result: { bestIdx: number | null; confidence: number; reasoning: string } }
  ).result

  if (result.bestIdx == null) {
    return { kind: "no-match", reasoning: result.reasoning }
  }

  const chosen = candidates[result.bestIdx]
  if (!chosen) {
    return { kind: "no-match", reasoning: "Match index out of range" }
  }

  if (!chosen.inStock) {
    const wider = scrapeSearchResults(12).filter(
      (c, i) => i !== result.bestIdx && c.inStock,
    )
    const altResp = await chrome.runtime.sendMessage({
      type: "find-alternative",
      appOrigin,
      material,
      oosCandidate: chosen,
      alternatives: wider.slice(0, 6),
    })
    let alternatives: Candidate[] = []
    if (altResp && (altResp as { ok?: boolean }).ok) {
      const r = (altResp as { result: { ranked: Array<{ idx: number }> } }).result
      alternatives = r.ranked
        .map((rk) => wider[rk.idx])
        .filter((c): c is Candidate => c != null)
    }
    return {
      kind: "oos",
      candidate: chosen,
      alternatives: alternatives.length ? alternatives : null,
    }
  }

  if (result.confidence >= 0.8) {
    // Don't navigate from inside this handler — the worker drives PDP
    // navigation, then sends "add-to-cart-on-pdp". Returning matched
    // signals "ready to add, please put me on the PDP."
    return {
      kind: "matched",
      candidate: chosen,
      confidence: result.confidence,
      reasoning: result.reasoning,
    }
  }

  return {
    kind: "review",
    candidates,
    reasoning: result.reasoning,
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Worker message handler
// ─────────────────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== "object") return false
  const m = message as { type?: string }

  if (m.type === "hd-driver-ping") {
    // Sync response — never returns true. Avoids leaving channels open.
    sendResponse({ ok: true, url: window.location.href })
    return false
  }

  if (m.type === "init-side-panel") {
    const init = message as { projectName: string; items: RunItem[] }
    panelState = {
      projectName: init.projectName,
      items: init.items,
      phase: "running",
    }
    renderPanel()
    sendResponse({ ok: true })
    return false
  }

  if (m.type === "drive-material") {
    const drive = message as { idx: number; material: Material; appOrigin: string }
    // If we're not on the right search page, tell the worker to navigate
    // us — and respond SYNCHRONOUSLY so the message channel doesn't get
    // torn down by a navigation we kicked off ourselves.
    if (!isOnSearchPageFor(drive.material)) {
      sendResponse({
        ok: true,
        navigateTo: searchUrlFor(drive.material),
      })
      return false
    }
    void driveMaterial(drive.idx, drive.material, drive.appOrigin).then((status) => {
      setItemStatus(drive.idx, status)
      sendResponse({ ok: true, status })
    })
    return true
  }

  if (m.type === "add-to-cart-on-pdp") {
    const req = message as { idx: number; candidate: Candidate }
    if (window.location.href !== req.candidate.url) {
      sendResponse({ ok: true, navigateTo: req.candidate.url })
      return false
    }
    void addToCart(req.candidate).then((r) => {
      if (r.ok) {
        setItemStatus(req.idx, { kind: "added", candidate: req.candidate })
        sendResponse({ ok: true, status: { kind: "added", candidate: req.candidate } })
      } else {
        sendResponse({
          ok: true,
          status: { kind: "error", message: r.error ?? "Add to cart failed" },
        })
      }
    })
    return true
  }

  if (m.type === "set-phase") {
    const sp = message as { phase: PanelState["phase"]; errorMessage?: string }
    panelState.phase = sp.phase
    panelState.errorMessage = sp.errorMessage
    renderPanel()
    sendResponse({ ok: true })
    return false
  }

  return false
})

chrome.runtime.sendMessage({
  type: "hd-driver-ready",
  url: window.location.href,
})

renderPanel()
