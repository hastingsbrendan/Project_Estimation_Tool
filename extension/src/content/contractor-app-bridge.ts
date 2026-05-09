/**
 * Bridge content script — runs on every contractor-app page at
 * document_idle. Two responsibilities:
 *
 *  1. Set `window.__contractorAppExt` so the materials page's
 *     <CartBuilderButton> can detect us.
 *  2. Listen for the page's `window.postMessage({ type: "build-cart-request" })`
 *     and forward to the extension's service worker via chrome.runtime
 *     message passing.
 *
 * No imports from contractor-app code — this script only knows the
 * postMessage protocol the page uses.
 */
import type { BridgeRequest, BridgeResponse } from "../shared/types"

const VERSION = chrome.runtime.getManifest().version
const EXT_ID = chrome.runtime.id

// Inject presence flag into the page's main world. Content scripts run in
// an isolated world, so we add a small <script> tag that writes the flag
// directly on window.
function injectPresenceFlag() {
  const payload = JSON.stringify({ version: VERSION, ext: EXT_ID })
  const code = `;(function(){try{window.__contractorAppExt=${payload};}catch(e){}})();`
  const s = document.createElement("script")
  s.textContent = code
  ;(document.head ?? document.documentElement).appendChild(s)
  s.remove()
}

injectPresenceFlag()

// Forward page-originated requests to the service worker. Validate origin
// + structure to avoid running arbitrary cross-site postMessages.
window.addEventListener("message", (event) => {
  if (event.source !== window) return
  const data = event.data
  if (!data || typeof data !== "object") return
  if (data.source !== "contractor-app") return
  const req = data as { type?: string; projectId?: string }

  if (req.type === "build-cart-request" && typeof req.projectId === "string") {
    const message: BridgeRequest = {
      type: "build-cart-request",
      projectId: req.projectId,
    }
    chrome.runtime
      .sendMessage(message)
      .then((res: BridgeResponse | undefined) => {
        // Echo result back to the page so the button can show "Building…"
        // or surface an error inline.
        window.postMessage(
          { source: "contractor-app-ext", ...res },
          window.location.origin,
        )
      })
      .catch((err: unknown) => {
        window.postMessage(
          {
            source: "contractor-app-ext",
            type: "error",
            message: err instanceof Error ? err.message : "Bridge failed",
          },
          window.location.origin,
        )
      })
  }
})

// The service worker can also ask the bridge to fetch from the
// contractor-app domain on its behalf (cookies travel automatically here).
// Worker → tabs.sendMessage(tabId, ...) → this onMessage listener.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== "object") return false
  if (message.type === "fetch-on-app-domain" && typeof message.path === "string") {
    fetch(`${window.location.origin}${message.path}`, {
      method: message.method ?? "GET",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: message.body ? JSON.stringify(message.body) : undefined,
    })
      .then(async (res) => {
        const text = await res.text()
        sendResponse({ ok: res.ok, status: res.status, body: text })
      })
      .catch((err) => {
        sendResponse({
          ok: false,
          status: 0,
          body: err instanceof Error ? err.message : "fetch failed",
        })
      })
    return true // keep channel open for async response
  }
  return false
})
