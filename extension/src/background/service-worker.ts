/**
 * MV3 service worker — central state + message router.
 *
 *  - From the contractor-app bridge: "build-cart-request" → kicks off a run
 *  - From the HD driver: "match-material" / "find-alternative" / pings —
 *    the worker proxies the first two through the bridge tab so cookies
 *    travel under the contractor-app domain
 *
 * Note: MV3 service workers can be evicted any time. Long-running run
 * state lives in chrome.storage.session keyed by runId — runPipeline is
 * resumable in principle (not implemented yet; for v0.2 we fail gracefully
 * if eviction happens mid-run).
 */
import type { BridgeRequest, BridgeResponse } from "../shared/types"
import {
  findBridgeTabId,
  relayFindAlternative,
  relayMatchMaterial,
  startCartRun,
} from "./cart-runner"

const VERSION = chrome.runtime.getManifest().version

chrome.runtime.onInstalled.addListener(() => {
  console.log(`[contractor-app-ext] installed v${VERSION}`)
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  void handle(message, sender)
    .then(sendResponse)
    .catch((err: unknown) => {
      sendResponse({
        ok: false,
        error: err instanceof Error ? err.message : "Worker failed",
      })
    })
  return true // async response
})

async function handle(
  message: unknown,
  sender: chrome.runtime.MessageSender,
): Promise<unknown> {
  if (!message || typeof message !== "object") {
    return { ok: false, error: "Bad message" }
  }
  const m = message as { type?: string }

  switch (m.type) {
    case "ping":
      return { type: "pong", version: VERSION } satisfies BridgeResponse

    case "build-cart-request": {
      if (!sender.tab?.id) {
        return { type: "error", message: "No originating tab" } satisfies BridgeResponse
      }
      if (!sender.origin) {
        return { type: "error", message: "Missing sender origin" } satisfies BridgeResponse
      }
      const req = message as BridgeRequest & { type: "build-cart-request" }
      const runId = await startCartRun({
        projectId: req.projectId,
        appOrigin: sender.origin,
        sourceTabId: sender.tab.id,
      })
      return { type: "build-cart-accepted", runId } satisfies BridgeResponse
    }

    case "hd-driver-ready":
      // Ack only — driver announces on every page load. Useful as a
      // service-worker keep-alive tick during long runs.
      return { ok: true }

    case "match-material": {
      const req = message as {
        appOrigin: string
        material: Parameters<typeof relayMatchMaterial>[0]["material"]
        candidates: Parameters<typeof relayMatchMaterial>[0]["candidates"]
      }
      const bridgeTabId = await findBridgeTabId(req.appOrigin)
      if (bridgeTabId == null) {
        return {
          ok: false,
          error: "Contractor-app tab is closed — re-open it to continue.",
        }
      }
      try {
        const result = await relayMatchMaterial({
          bridgeTabId,
          material: req.material,
          candidates: req.candidates,
        })
        return { ok: true, result }
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : "match-material relay failed",
        }
      }
    }

    case "find-alternative": {
      const req = message as {
        appOrigin: string
        material: Parameters<typeof relayFindAlternative>[0]["material"]
        oosCandidate: Parameters<typeof relayFindAlternative>[0]["oosCandidate"]
        alternatives: Parameters<typeof relayFindAlternative>[0]["alternatives"]
      }
      const bridgeTabId = await findBridgeTabId(req.appOrigin)
      if (bridgeTabId == null) {
        return {
          ok: false,
          error: "Contractor-app tab is closed — re-open it to continue.",
        }
      }
      try {
        const result = await relayFindAlternative({
          bridgeTabId,
          material: req.material,
          oosCandidate: req.oosCandidate,
          alternatives: req.alternatives,
        })
        return { ok: true, result }
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : "find-alternative relay failed",
        }
      }
    }

    default:
      return { ok: false, error: `Unknown message type: ${m.type ?? "(none)"}` }
  }
}
