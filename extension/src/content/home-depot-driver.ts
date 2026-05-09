/**
 * Home Depot content script — drives search, scrapes candidates, clicks
 * "add to cart." Runs at document_idle on https://www.homedepot.com/*.
 *
 * Phase A (this file): announces presence to the worker so the worker
 * knows the tab is ready, and renders the side panel container.
 * Phase B (Batch C): the actual search + scrape + add-to-cart loop.
 */

const PANEL_ID = "contractor-app-cart-side-panel"

function ensureSidePanel(): HTMLDivElement {
  let panel = document.getElementById(PANEL_ID) as HTMLDivElement | null
  if (panel) return panel
  panel = document.createElement("div")
  panel.id = PANEL_ID
  Object.assign(panel.style, {
    position: "fixed",
    top: "12px",
    right: "12px",
    width: "320px",
    maxHeight: "calc(100vh - 24px)",
    overflow: "auto",
    background: "white",
    border: "1px solid #d4d4d4",
    borderRadius: "8px",
    boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
    fontFamily: "system-ui, -apple-system, sans-serif",
    fontSize: "13px",
    color: "#18181b",
    padding: "12px",
    zIndex: "2147483646",
  } satisfies Partial<CSSStyleDeclaration>)
  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
      <strong style="font-size:14px;">Cart builder (preview)</strong>
      <button data-action="close" style="background:none;border:none;cursor:pointer;font-size:16px;color:#71717a;">×</button>
    </div>
    <p style="color:#52525b;margin:0;line-height:1.4;">
      Cart builder is in preview. Search + add-to-cart automation lands in
      the next build (Batch C). For now, the contractor app's
      "Build cart at Home Depot" button confirms the extension is wired
      and the v1 API is reachable.
    </p>
  `
  panel.querySelector('[data-action="close"]')?.addEventListener("click", () => {
    panel?.remove()
  })
  document.body.appendChild(panel)
  return panel
}

// Announce ourselves to the worker. The worker can then assign work via
// chrome.tabs.sendMessage.
chrome.runtime.sendMessage({ type: "hd-driver-ready", url: window.location.href })

// Render the side panel placeholder.
ensureSidePanel()

// Phase B will replace this with a real message handler that listens for
// search-and-add commands from the worker.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== "object") return false
  if (message.type === "hd-driver-ping") {
    sendResponse({ ok: true, url: window.location.href })
    return true
  }
  return false
})
