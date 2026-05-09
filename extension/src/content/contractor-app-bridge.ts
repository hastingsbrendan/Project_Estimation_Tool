/**
 * Bridge content script — runs on every contractor-app page at
 * document_idle. Three responsibilities:
 *
 *  1. Announce extension presence to the page via window.postMessage so
 *     <CartBuilderButton> can detect us. We use postMessage instead of
 *     setting a window.* property because Vercel's CSP blocks the inline
 *     <script> we'd need to inject from our isolated content-script
 *     world into the page's main world.
 *  2. Listen for the page's `window.postMessage({ type: "build-cart-request" })`
 *     and forward to the extension's service worker via chrome.runtime
 *     message passing.
 *  3. Act as a fetch proxy for the worker — when the worker needs to
 *     hit /api/v1/* on the contractor-app domain, it sends us a
 *     "fetch-on-app-domain" message and we run the fetch from this tab
 *     so the user's session cookie travels automatically.
 *
 * No imports from contractor-app code — this script only knows the
 * postMessage / chrome.runtime protocols.
 */
import type { BridgeRequest, BridgeResponse } from "../shared/types"

const VERSION = chrome.runtime.getManifest().version
const EXT_ID = chrome.runtime.id

/**
 * Announce ourselves via postMessage. The page's button listens on
 * window for `{ source: "contractor-app-ext", type: "ready", ... }` and
 * flips state.
 *
 * We send twice — once immediately and once after a short delay — to
 * cover both timing orders: bridge ran before the button mounted, OR
 * button mounted before the bridge ran.
 */
function announcePresence() {
  const msg = {
    source: "contractor-app-ext",
    type: "ready" as const,
    version: VERSION,
    ext: EXT_ID,
  }
  try {
    window.postMessage(msg, window.location.origin)
  } catch {
    // Cross-origin or detached frame — ignore.
  }
}

announcePresence()
setTimeout(announcePresence, 250)

// Forward page-originated requests to the service worker. Validate
// origin + structure to avoid forwarding arbitrary cross-site postMessages.
window.addEventListener("message", (event) => {
  if (event.source !== window) return
  const data = event.data
  if (!data || typeof data !== "object") return
  if (data.source !== "contractor-app") return
  const req = data as { type?: string; projectId?: string }

  // Page asked for the extension to re-announce — fire it immediately.
  // Used by the button on mount in case the initial announce fired
  // before the listener was attached.
  if (req.type === "ping") {
    announcePresence()
    return
  }

  if (req.type === "build-cart-request" && typeof req.projectId === "string") {
    const message: BridgeRequest = {
      type: "build-cart-request",
      projectId: req.projectId,
    }
    chrome.runtime
      .sendMessage(message)
      .then((res: BridgeResponse | undefined) => {
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

// The service worker can ask the bridge to fetch from the contractor-app
// domain on its behalf (cookies travel automatically here).
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
