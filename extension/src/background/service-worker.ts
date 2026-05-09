/**
 * MV3 service worker — central state + message router. Receives
 * "build-cart-request" from the bridge content script and kicks off the
 * cart-runner orchestration loop. Stays simple: each run spawns a HD tab,
 * forwards material rows to the driver, collates results.
 *
 * Note: MV3 service workers can be evicted any time. Long-running state
 * (active runs) lives in chrome.storage.session, keyed by runId. The
 * runner loop awaits in a way that's safe to resume on re-wake.
 */
import type { BridgeRequest, BridgeResponse } from "../shared/types"
import { startCartRun } from "./cart-runner"

const VERSION = chrome.runtime.getManifest().version

chrome.runtime.onInstalled.addListener(() => {
  console.log(`[contractor-app-ext] installed v${VERSION}`)
})

// Page-originated messages forwarded from the bridge content script.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  void handleMessage(message as BridgeRequest, sender)
    .then(sendResponse)
    .catch((err: unknown) => {
      sendResponse({
        type: "error",
        message: err instanceof Error ? err.message : "Worker failed",
      } satisfies BridgeResponse)
    })
  return true // async response
})

async function handleMessage(
  message: BridgeRequest,
  sender: chrome.runtime.MessageSender,
): Promise<BridgeResponse> {
  if (!message || typeof message !== "object") {
    return { type: "error", message: "Bad message" }
  }
  switch (message.type) {
    case "ping":
      return { type: "pong", version: VERSION }

    case "build-cart-request": {
      if (!sender.tab?.id) {
        return { type: "error", message: "No originating tab" }
      }
      if (!sender.origin) {
        return { type: "error", message: "Missing sender origin" }
      }
      const runId = await startCartRun({
        projectId: message.projectId,
        appOrigin: sender.origin,
        sourceTabId: sender.tab.id,
      })
      return { type: "build-cart-accepted", runId }
    }

    default:
      return { type: "error", message: "Unknown message type" }
  }
}
